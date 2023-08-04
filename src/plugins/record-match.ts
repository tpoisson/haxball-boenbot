import IChatCommand from "../models/IChatCommand";
import RoomPlugin from "../room/room-plugin";

export class RecordMatchPlugin extends RoomPlugin {
  private isRecording = false;

  private firstKickoff = false;

  getChatsCommands(): IChatCommand[] {
    return [];
  }

  public override onGameKickoff(byPlayer: PlayerObject | null): void {
    const shouldRecord = !this.firstKickoff && this.room.getPlayerList().some((player) => player.name === "Fish");
    if (shouldRecord) {
      this.firstKickoff = true;
      this.isRecording = true;
      this.room.startRecording();
    }
  }

  public override onGameStop(byPlayer: PlayerObject | null): void {
    this.firstKickoff = false;
    if (this.isRecording) {
      const recordingData = this.room.stopRecording();
      this.isRecording = false;
      this.uploadData(recordingData);
    }
  }

  private async uploadData(recordingData: Uint8Array) {
    try {
      console.log("Blobing");
      const blob = new Blob([recordingData.buffer], { type: "application/octet-stream" });
      const formData = new FormData();
      formData.append("file", blob, `HBReplay-${new Date().toISOString().replace(/[^0-9A-Z]/gi, "-")}.hbr2`);
      // https://anonymfile.com/docs/api
      console.log("Sending...");

      // https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
      const response = await window.fetch("https://anonymfile.com/api/v1/upload", {
        method: "POST",
        mode: "cors",
        body: formData,
        headers: {
          Expire: "7",
        },
      });
      console.log("Sent");
      const responseData: { status: boolean; data: { file: { url: { full: string } } } } = await response.json();
      console.log(`Response... ${responseData}`);
      if (responseData.status) {
        this.room.sendAnnouncement(`📼 Replay available here : ${responseData.data.file.url.full}`, undefined, 0xaaaaaa, undefined, 0);
      }
    } catch (error) {
      this.room.sendAnnouncement(`Error uploading replay : ${error}`);
    }
  }
}
