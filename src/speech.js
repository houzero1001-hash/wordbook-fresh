export function speakEnglish(
  text,
  {
    synth = globalThis.speechSynthesis,
    Utterance = globalThis.SpeechSynthesisUtterance,
    onError = () => {},
  } = {},
) {
  if (!synth || !Utterance) throw Error("此浏览器不支持系统发音");
  const voices = synth.getVoices().filter((v) => /^en(?:-|_)/i.test(v.lang));
  if (!voices.length)
    throw Error("未检测到英语语音，请在iPhone设置中下载英语朗读语音后重试");
  const voice =
    voices.find((v) => v.localService && v.lang === "en-US") ||
    voices.find((v) => v.lang === "en-US") ||
    voices[0];
  synth.cancel();
  const u = new Utterance(text);
  u.lang = voice.lang;
  u.voice = voice;
  u.rate = 0.9;
  u.onerror = (e) => {
    if (!["canceled", "interrupted"].includes(e.error))
      onError("朗读失败，请检查设备英语语音设置");
  };
  synth.speak(u);
  return u;
}
