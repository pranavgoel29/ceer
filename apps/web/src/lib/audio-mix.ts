/** Mixes one or more audio streams into a single track on the video stream for MediaRecorder. */
export async function attachAudioToVideoStream(
  videoStream: MediaStream,
  audioStreams: MediaStream[],
): Promise<{ stream: MediaStream; cleanup: () => void }> {
  const tracksToAttach = new Set(audioStreams.flatMap((stream) => stream.getAudioTracks()));

  for (const track of videoStream.getAudioTracks()) {
    videoStream.removeTrack(track);
    // Display-capture loopback tracks are often the same objects passed in audioStreams;
    // stopping them here would silence system audio when re-attaching or mixing.
    if (!tracksToAttach.has(track)) {
      track.stop();
    }
  }

  if (audioStreams.length === 0) {
    return { stream: videoStream, cleanup: () => undefined };
  }

  if (audioStreams.length === 1) {
    for (const track of audioStreams[0]!.getAudioTracks()) {
      if (!videoStream.getAudioTracks().includes(track)) {
        videoStream.addTrack(track);
      }
    }
    return { stream: videoStream, cleanup: () => undefined };
  }

  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();

  for (const audioStream of audioStreams) {
    const source = audioContext.createMediaStreamSource(audioStream);
    source.connect(destination);
  }

  await audioContext.resume();

  for (const track of destination.stream.getAudioTracks()) {
    videoStream.addTrack(track);
  }

  return {
    stream: videoStream,
    cleanup: () => {
      void audioContext.close();
    },
  };
}
