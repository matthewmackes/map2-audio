"""Built-in Textual command providers for the unified console."""

from __future__ import annotations

from textual.command import DiscoveryHit, Hit, Provider


class RouteCommandProvider(Provider):
    """Expose route navigation and local screen actions through Textual's palette."""

    async def discover(self):
        app = self.app
        routes = getattr(app, "iter_route_hits", None)
        if routes is not None:
            for hit in routes():
                yield DiscoveryHit(
                    hit["display"],
                    lambda route_key=hit["route_key"]: app.call_from_thread(app.open_route, route_key),
                    text=hit["text"],
                    help=hit["help"],
                )

        local_actions = getattr(app, "iter_local_action_hits", None)
        if local_actions is not None:
            for hit in local_actions():
                yield DiscoveryHit(
                    hit["display"],
                    lambda action_id=hit["action_id"]: app.call_from_thread(app.invoke_local_action, action_id),
                    text=hit["text"],
                    help=hit["help"],
                )

        system_actions = getattr(app, "iter_system_action_hits", None)
        if system_actions is not None:
            for hit in system_actions():
                yield DiscoveryHit(
                    hit["display"],
                    hit["command"],
                    text=hit["text"],
                    help=hit["help"],
                )

    async def search(self, query: str):
        matcher = self.matcher(query)
        hits = []

        for group in ("iter_route_hits", "iter_local_action_hits", "iter_system_action_hits"):
            iterator = getattr(self.app, group, None)
            if iterator is None:
                continue
            for item in iterator():
                score = matcher.match(item["text"])
                if score <= 0:
                    continue
                hits.append((score, item))

        hits.sort(key=lambda item: item[0], reverse=True)
        for score, item in hits[:40]:
            yield Hit(
                score,
                matcher.highlight(item["display"]),
                item["command"],
                text=item["text"],
                help=item["help"],
            )
