// Daybloom microphone tap (AudioWorklet). Collects mono input at the context's rate and posts
// it to the main thread about every 20 ms with its RMS level, so the UI can draw the voice and
// the resampler can feed Whistle. Plain JS: worklets load as-is, outside the bundle.
class DaybloomCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.max(256, Math.round(sampleRate * 0.02));
    this.buf = new Float32Array(this.size);
    this.n = 0;
    this.on = true;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.on = false;
    };
  }
  process(inputs) {
    if (!this.on) return false;
    const input = inputs[0];
    const ch = input && input[0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      // Down-mix: average every channel the device gives us.
      let v = ch[i];
      if (input.length > 1) {
        for (let c = 1; c < input.length; c++) v += input[c][i];
        v /= input.length;
      }
      this.buf[this.n++] = v;
      if (this.n === this.size) {
        let sum = 0;
        let peak = 0;
        for (let k = 0; k < this.size; k++) {
          const s = this.buf[k];
          sum += s * s;
          const a = s < 0 ? -s : s;
          if (a > peak) peak = a;
        }
        const out = this.buf;
        this.port.postMessage({ pcm: out, rms: Math.sqrt(sum / this.size), peak }, [out.buffer]);
        this.buf = new Float32Array(this.size);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('daybloom-capture', DaybloomCapture);
