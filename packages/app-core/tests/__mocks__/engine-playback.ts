export class Player {
  muted = new Set<number>();
  solo: number | null = null;
  onComplete: (() => void) | null = null;
  onRepeat: (() => void) | null = null;
  onPositionChange: ((channelId: number, eventIndex: number, totalEvents: number) => void) | null = null;
  constructor(_ctx?: any) {}
  async playAST(_song: any) { return; }
  stop() { return; }
  setMasterVolume(_v: number) { return; }
  setPerChannelAnalyser(_enabled: boolean) { return; }
  getMasterGain() { return { gain: { value: 1 } }; }
  setChannelVolume(_id: number, _volume: number) { return; }
}
export default { Player };
