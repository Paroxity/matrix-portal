import {
    MatrixClient,
    SimpleFsStorageProvider,
    AutojoinRoomsMixin,
} from "matrix-bot-sdk";
import { MeiliSearch } from "meilisearch";

const homeserverUrl = "https://matrix.org"; //TODO: Config
const accessToken = "ACCESS_TOKEN"; //TODO: Config
const storage = new SimpleFsStorageProvider("bot.json");
const client = new MatrixClient(homeserverUrl, accessToken, storage);
AutojoinRoomsMixin.setupOnClient(client);

client.on("room.message", handleMessage);
await client.start();
console.log("Client started!");

const search = new MeiliSearch({
    host: "http://127.0.0.1:7700"
});
const index = search.index("messages");

const room = "!sApVUfrfniKLwiIemG:matrix.org"; //TODO: Support multiple rooms?
await saveHistoricalMessages(room); 

async function handleMessage(roomId, event): Promise<void> { //TODO: Fix argument types
    if (event.type !== "m.room.message") return;
    if (event.content?.msgtype !== "m.text") return;

    const sender = event.sender;
    const profile = await client.getUserProfile(sender);

    let response = await index.addDocuments([{
        key: roomId.replace(/[^a-zA-Z0-9]/g, "") + event.event_id.replace("$", ""),
        eventId: event.event_id,
        roomId,
        sender,
        name: profile.displayname,
        profileImage: profile?.avatar_url ? client.mxcToHttp(profile.avatar_url) : null,
        message: event.content.body,
        timestamp: event.origin_server_ts,
    }]);
}

async function saveHistoricalMessages(roomId: string): Promise<void> { //TODO: Fix return type
    let from: string | undefined;
    let messages: Array<any> = []; //TODO: Fix type
    while (true) {
        const events = await client.doRequest(
            "GET",
            `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages`,
            { dir: "b", limit: 100, from },
        );
        let last_ev = "";
        for (const ev of events.chunk) {
            last_ev = ev.type;
            if (ev.type === "m.room.create") {
                break;
            } else if (ev.type === "m.room.message") {
                messages.push(ev);
                handleMessage(roomId, ev);
            }
        }
        console.log(messages.length + " messages loaded");
        if (last_ev === "m.room.create") break;
        if (from === events.end) break;
        from = events.end;
    }
}