"""
Port 80 to 3000 Reverse Proxy

Lightweight TCP proxy that forwards connections from port 80 to port 3000.
Required for mobile app compatibility (expects port 80).

The web static server on :3000 already proxies /api/* + WebSocket upgrades to
the FastAPI backend on :8080 and SPA-falls back unknown paths to index.html,
so retargeting :80 → :3000 keeps backend traffic working AND lets browsers
hitting bare http://<host>/<spa-route> reach the React app instead of
receiving FastAPI's {"detail":"Not Found"}. (Previously :80 forwarded
directly to :8080, which bypassed the SPA fallback.)

Run with: sudo python -m app.services.port80_proxy
Or as a systemd service.
"""

import asyncio
import logging
import signal
import sys

logger = logging.getLogger(__name__)

LISTEN_PORT = 80
TARGET_HOST = "127.0.0.1"
TARGET_PORT = 3000
BUFFER_SIZE = 65536


class PortProxy:
    """Async TCP proxy for forwarding port 80 to 3000 (the static web server)."""

    def __init__(self, listen_port: int = LISTEN_PORT,
                 target_host: str = TARGET_HOST,
                 target_port: int = TARGET_PORT):
        self.listen_port = listen_port
        self.target_host = target_host
        self.target_port = target_port
        self._server = None
        self._running = False
        self._connections = 0

    async def _pipe(self, reader: asyncio.StreamReader,
                    writer: asyncio.StreamWriter,
                    direction: str):
        """Pipe data between reader and writer."""
        try:
            while True:
                data = await reader.read(BUFFER_SIZE)
                if not data:
                    break
                writer.write(data)
                await writer.drain()
        except (ConnectionResetError, BrokenPipeError) as e:
            logger.debug(f"Pipe {direction} connection closed: {type(e).__name__}")
        except Exception as e:
            logger.debug(f"Pipe {direction} error: {e}")
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception as e:
                logger.debug(f"Pipe {direction} writer close error: {e}")

    async def _handle_client(self, client_reader: asyncio.StreamReader,
                             client_writer: asyncio.StreamWriter):
        """Handle incoming client connection."""
        self._connections += 1
        peername = client_writer.get_extra_info('peername')
        logger.debug(f"New connection from {peername}")

        try:
            # Connect to target
            target_reader, target_writer = await asyncio.open_connection(
                self.target_host, self.target_port
            )

            # Create bidirectional pipes
            await asyncio.gather(
                self._pipe(client_reader, target_writer, "client->target"),
                self._pipe(target_reader, client_writer, "target->client"),
            )

        except ConnectionRefusedError:
            logger.warning(f"Target {self.target_host}:{self.target_port} refused connection")
        except Exception as e:
            logger.error(f"Connection handler error: {e}")
        finally:
            self._connections -= 1
            try:
                client_writer.close()
                await client_writer.wait_closed()
            except Exception as e:
                logger.debug(f"Client writer close error: {e}")

    async def start(self) -> bool:
        """Start the proxy server."""
        if self._running:
            return True

        try:
            self._server = await asyncio.start_server(
                self._handle_client,
                "0.0.0.0",
                self.listen_port,
                reuse_address=True
            )
            self._running = True
            logger.info(f"Port proxy started: 0.0.0.0:{self.listen_port} -> "
                       f"{self.target_host}:{self.target_port}")
            return True

        except PermissionError:
            logger.error(f"Permission denied binding to port {self.listen_port}. "
                        "Run with sudo or use setcap.")
            return False
        except OSError as e:
            logger.error(f"Failed to start proxy: {e}")
            return False

    async def stop(self):
        """Stop the proxy server."""
        if not self._running:
            return

        self._running = False
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        logger.info("Port proxy stopped")

    async def serve_forever(self):
        """Run the server until stopped."""
        if not self._running:
            if not await self.start():
                return

        async with self._server:
            await self._server.serve_forever()


async def main():
    """Main entry point for standalone execution."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
    )

    proxy = PortProxy()

    # Handle shutdown signals
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(proxy.stop()))

    logger.info("Starting MAP2 port 80 proxy...")
    logger.info("Press Ctrl+C to stop")

    try:
        await proxy.serve_forever()
    except asyncio.CancelledError:
        pass
    finally:
        await proxy.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutdown requested")
        sys.exit(0)
