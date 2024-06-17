function generateSSML(data, module, voiceActor) {
  const { text, keywords, phoneticWords } = data;

  if (module === "Dialogic/Conversational") {
    let ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">`;

    data.forEach((speakerData) => {
      const { voice, text, keywords, phoneticWords } = speakerData;

      const sentences = text
        .split(/(?<=[.?!])\s+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence);

      let content = "";

      sentences.forEach((sentence) => {
        // Add emphasis on keywords
        keywords?.forEach(({ word, emphasis }) => {
          const regex = new RegExp(`\\b${word}\\b`, "gi");
          sentence = sentence.replace(
            regex,
            `<emphasis level="${emphasis}">${word}</emphasis>`
          );
        });

        // Add breaks at commas for natural pauses
        // sentence = sentence.replace(/,/g, '<break time="200ms"/>');

        // Add prosody variations
        // let prosodyAttributes = 'rate="medium" pitch="medium" volume="medium"';
        // if (sentence.length < 50) {
        //   prosodyAttributes = 'rate="medium" pitch="high" volume="high"';
        // } else if (sentence.length > 150) {
        //   prosodyAttributes = 'rate="medium" pitch="low" volume="soft"';
        // }
        // <prosody ${prosodyAttributes}></prosody>
        content += `<s>${sentence}</s>`;
      });

      ssml += `<voice name="${voice}">${content}</voice>`;
    });

    ssml += `</speak>`;

    return ssml;
  } else {
    // Non-conversational module
    const sentences = text
      .split(/(?<=[.?!])\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence);

    let content = "";

    sentences.forEach((sentence) => {
      // Add emphasis on keywords
      keywords?.forEach(({ word, emphasis }) => {
        const regex = new RegExp(`\\b${word}\\b`, "gi");
        sentence = sentence.replace(
          regex,
          `<emphasis level="${emphasis}">${word}</emphasis>`
        );
      });

    //   // Add breaks at commas for natural pauses
    //   sentence = sentence.replace(/,/g, '<break time="200ms"/>');

      // Add prosody variations
    //   let prosodyAttributes = 'rate="medium" pitch="medium" volume="medium"';
    //   if (sentence.length < 50) {
    //     prosodyAttributes = 'rate="medium" pitch="high" volume="medium"';
    //   } else if (sentence.length > 150) {
    //     prosodyAttributes = 'rate="slow" pitch="low" volume="soft"';
    //   }
    //   <prosody ${prosodyAttributes}></prosody>
      content += `<s>${sentence}</s>`;
    });

    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${voiceActor}">${content}</voice></speak>`;

    return ssml;
  }
}

module.exports = { generateSSML };
