const { SlashCommandBuilder, PermissionFlagsBits, ActivityType } = require('discord.js');
const { createAudioResource, getVoiceConnection } = require('@discordjs/voice');
const errorEmbed = require('../../embeds/errorEmbed');
const nowPlayingEmbed = require('../../embeds/nowPlaying');
const IcecastMetadataStats = require('../../util/stats');
const { getNextResource } = require("../../util/audioHandler");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Plays a different station based off of station ID')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('The station ID to play.')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const stationId = interaction.options.getString('id');
        const pattern = /^[a-zA-Z0-9_-]{8}$/;

        // 1. Validations
        if (!interaction.member.voice.channel) {
            return interaction.reply({ embeds: [errorEmbed('You must be in a voice channel.')] });
        }

        if (!pattern.test(stationId)) {
            return interaction.reply({ embeds: [errorEmbed('Please provide a valid station ID.')] });
        }

        const connection = getVoiceConnection(interaction.guildId);
        if (!connection || !connection.state.subscription) {
            return interaction.reply({ embeds: [errorEmbed('Bot is not connected to a player. Use /connect first.')] });
        }

        // 2. Fetch Metadata and Play
        // We fetch first to ensure the station exists and to get ICY headers
        const streamUrl = `https://radio.garden/api/ara/content/listen/${stationId}/channel.mp3`;

        try {
            // Update central memory with the ID
            const resource = getNextResource(stationId);

            if (resource) {
                connection.state.subscription.player.play(resource);
            }
            const response = await fetch(streamUrl);

            if (response.status === 404) {
                return interaction.reply({ embeds: [errorEmbed("Station ID not found (404).")] });
            }

            // Generate resource ONCE via your handler (updates lastUsedId)
            if (!resource) {
                return interaction.reply({ embeds: [errorEmbed("Failed to initialize audio resource.")] });
            }

            // Play exactly once
            connection.state.subscription.player.play(resource);

            // 3. Handle Metadata/Stats
            if (connection.statsListener) connection.statsListener.stop();

            connection.statsListener = new IcecastMetadataStats(streamUrl, {
                onStats: (stats) => {
                    if (stats) {
                        let icecast = [];
                        if (stats.icestats && Array.isArray(stats.icestats.source)) {
                            icecast = stats.icestats.source.filter(point =>
                                point.listenurl.includes(stationId)
                            );
                        }

                        const title = icecast[0]?.title || stats.icy?.StreamTitle || stats.ogg?.TITLE || "Unknown Title";
                        const artist = icecast[0]?.artist || stats.ogg?.ARTIST || "Unknown Artist";

                        try {
                            interaction.client.user.setActivity(`${title} - ${artist}`, { type: ActivityType.Listening });
                        } catch (e) { console.error("Activity Error:", e); }
                    }
                },
                interval: 15,
                sources: ['icy', 'ogg' ]
            });

            connection.statsListener.start();

            // 4. Send Response
            const embed = nowPlayingEmbed(
                response.headers.get('icy-name') || "Radio Garden Station",
                response.headers.get('icy-genre') || "Various",
                response.headers.get('icy-url') || "https://radio.garden",
                response.headers.get('server') || "Unknown"
            );

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error("Play Command Error:", error);
            return interaction.reply({ embeds: [errorEmbed("An error occurred while trying to play the stream.")] });
        }
    },
};