export function parseHostFromNodeAddress(nodeAddress?: string | null): string {
  if (!nodeAddress) {
    return "";
  }

  const trimmed = String(nodeAddress).trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = trimmed.includes("://")
      ? new URL(trimmed)
      : new URL(`http://${trimmed}`);
    return (parsed.hostname || "").trim().toLowerCase();
  } catch (_error) {
    // Fallback for raw host values.
  }

  const hostOnly = trimmed.split("/", 1)[0].split("@").pop() || "";
  return hostOnly.split(":")[0].trim().toLowerCase();
}

export function resolveAvbHostLabel(
  entry: {
    host?: string | null;
    node_address?: string | null;
  } | null | undefined
): string {
  const directHost = (entry?.host || "").trim();
  if (directHost) {
    return directHost;
  }

  return parseHostFromNodeAddress(entry?.node_address || null);
}
