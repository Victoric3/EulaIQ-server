const fsPromises = require('fs').promises;

async function concatenateWavFiles(segmentFiles, outputPath) {
    if (segmentFiles.length === 0) throw new Error("No segments to concatenate");

    const buffers = await Promise.all(
      segmentFiles.map(file => fsPromises.readFile(file))
    );

    if (buffers.length === 1) {
      // If only one segment, just copy it
      await fsPromises.writeFile(outputPath, buffers[0]);
      return;
    }

    // Read the header from the first file (44 bytes for standard WAV)
    const firstHeader = buffers[0].slice(0, 44);
    const sampleRate = firstHeader.readUInt32LE(24); // e.g., 44100 Hz
    const byteRate = firstHeader.readUInt32LE(28);   // Byte rate
    const bitsPerSample = firstHeader.readUInt16LE(34); // e.g., 16-bit
    const channels = firstHeader.readUInt16LE(22);    // e.g., 1 (mono) or 2 (stereo)

    // Collect all audio data (skip headers after the first file)
    const audioData = buffers.map((buffer, i) => buffer.slice(i === 0 ? 44 : 44));
    const combinedAudioData = Buffer.concat(audioData);
    const dataSize = combinedAudioData.length;
    const fileSize = dataSize + 36; // Total size minus 8-byte RIFF header

    // Create new WAV header
    const newHeader = Buffer.alloc(44);
    firstHeader.copy(newHeader, 0, 0, 44); // Copy original header as base
    newHeader.writeUInt32LE(fileSize, 4);  // Update total file size
    newHeader.writeUInt32LE(dataSize, 40); // Update data chunk size

    // Combine header and audio data
    const combinedBuffer = Buffer.concat([newHeader, combinedAudioData]);
    await fsPromises.writeFile(outputPath, combinedBuffer);

    console.log(`WAV files concatenated into ${outputPath} with ${dataSize} bytes of audio data`);
  }


module.exports = { concatenateWavFiles }