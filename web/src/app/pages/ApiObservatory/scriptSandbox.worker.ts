type ScriptTestResult = {
  name: string
  pass: boolean
  message?: string
}

type RunMessage = {
  type: 'run'
  requestId: string
  script: string
  timeoutMs: number
  context: {
    request: Record<string, unknown>
    response: Record<string, unknown> | null
    environment: Record<string, string>
    collectionVariables?: Record<string, string>
    globalVariables?: Record<string, string>
  }
}

function createAssertion(value: unknown) {
  return {
    toBe(expected: unknown) {
      if (value !== expected) {
        throw new Error(`Expected ${JSON.stringify(value)} to be ${JSON.stringify(expected)}`)
      }
    },
    toContain(expected: unknown) {
      if (typeof value === 'string') {
        if (!value.includes(String(expected))) {
          throw new Error(`Expected string to contain ${String(expected)}`)
        }
        return
      }
      if (Array.isArray(value)) {
        if (!value.includes(expected)) {
          throw new Error(`Expected array to contain ${JSON.stringify(expected)}`)
        }
        return
      }
      throw new Error('toContain requires string or array')
    },
    toHaveProperty(path: string, expected?: unknown) {
      const segments = path.split('.')
      let current: unknown = value
      for (const segment of segments) {
        if (!current || typeof current !== 'object' || !(segment in (current as Record<string, unknown>))) {
          throw new Error(`Property ${path} not found`)
        }
        current = (current as Record<string, unknown>)[segment]
      }
      if (arguments.length === 2 && current !== expected) {
        throw new Error(`Expected ${path} to equal ${JSON.stringify(expected)}; got ${JSON.stringify(current)}`)
      }
    },
    toBeBelow(expected: number) {
      if (typeof value !== 'number' || value >= expected) {
        throw new Error(`Expected ${JSON.stringify(value)} to be below ${expected}`)
      }
    },
  }
}

async function runScript(message: RunMessage): Promise<void> {
  const testResults: ScriptTestResult[] = []
  const logs: string[] = []
  const environment = { ...message.context.environment }

  const request = { ...message.context.request }
  const response = message.context.response ? { ...message.context.response } : null

  const variables = {
    get(key: string) {
      if (key in request) {
        return String(request[key])
      }
      if (message.context.collectionVariables && key in message.context.collectionVariables) {
        return message.context.collectionVariables[key]
      }
      if (key in environment) {
        return environment[key]
      }
      if (message.context.globalVariables && key in message.context.globalVariables) {
        return message.context.globalVariables[key]
      }
      return undefined
    },
  }

  const pm = {
    environment: {
      get(key: string) {
        return environment[key]
      },
      set(key: string, value: string) {
        environment[key] = String(value)
      },
    },
    variables,
    request,
    response,
    test(name: string, fn: () => void) {
      try {
        fn()
        testResults.push({ name, pass: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        testResults.push({ name, pass: false, message })
      }
    },
    expect(value: unknown) {
      return createAssertion(value)
    },
    async sendRequest(url: string, callback?: (error: unknown, responsePayload?: unknown) => void) {
      try {
        const fetched = await fetch(url)
        const text = await fetched.text()
        const result = {
          status: fetched.status,
          headers: Object.fromEntries(fetched.headers.entries()),
          text,
        }
        callback?.(null, result)
        return result
      } catch (error) {
        callback?.(error)
        throw error
      }
    },
    log(...args: unknown[]) {
      logs.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '))
    },
  }

  let timeoutHandle: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = self.setTimeout(() => {
      reject(new Error('Script timed out'))
    }, message.timeoutMs)
  })

  try {
    const runner = new Function('pm', `"use strict";\n${message.script}`)
    await Promise.race([Promise.resolve(runner(pm)), timeout])

    self.postMessage({
      type: 'result',
      requestId: message.requestId,
      data: {
        request,
        environment,
        tests: testResults,
        logs,
      },
    })
  } catch (error) {
    const details = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) }
    self.postMessage({
      type: 'error',
      requestId: message.requestId,
      error: details,
      data: {
        request,
        environment,
        tests: testResults,
        logs,
      },
    })
  } finally {
    if (typeof timeoutHandle === 'number') {
      clearTimeout(timeoutHandle)
    }
  }
}

self.onmessage = (event: MessageEvent<RunMessage>) => {
  if (!event.data || event.data.type !== 'run') {
    return
  }
  void runScript(event.data)
}
