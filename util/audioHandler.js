// util/audioHandler.js
const { createAudioResource } = require('@discordjs/voice');

let lastStation = null; // Can be an ID or a URL

function getNextResource(input = null) {
    if (input) {
        lastStation = input;
    }

    if (!lastStation) return null;

    // Check if the stored station is a URL or a Radio Garden ID
    const isUrl = lastStation.startsWith('http');
    const url = isUrl
        ? lastStation
        : `https://radio.garden/api/ara/content/listen/${lastStation}/channel.mp3`;

    return createAudioResource(url, {
        inlineVolume: true,
        metadata: {
            title: isUrl ? "Custom Stream" : `Radio Garden: ${lastStation}`,
            source: lastStation
        }
    });
}

module.exports = { getNextResource };