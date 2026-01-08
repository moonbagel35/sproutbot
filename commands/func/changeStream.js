const { SlashCommandBuilder, PermissionFlagsBits, ActivityType } = require('discord.js');
const { createAudioResource, StreamType, getVoiceConnection } = require('@discordjs/voice');
const errorEmbed = require('../../embeds/errorEmbed');
const nowPlayingEmbed = require('../../embeds/nowPlaying');
const IcecastMetadataStats = require('../../util/stats');
const {getNextResource} = require("../../util/audioHandler");

// Simplified URL validation
const isValidURL = (str) => {
    try {
        const url = new URL(str);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
};

// Map choices to DiscordJS StreamTypes
const streamTypeMap = {
    'arbitrary': StreamType.Arbitrary,
    'oggopus': StreamType.OggOpus,
    'opus': StreamType.Opus,
    'webmopus': StreamType.WebmOpus,
    'raw': StreamType.Raw
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('change')
        .setDescription('Changes stream URL')
        .addStringOption(option =>
            option.setName('stream')
                .setDescription('The stream URL to play.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('type')
                .setDescription('The input type (default: Arbitrary)')
                .addChoices(
                    { name: 'Arbitrary', value: 'arbitrary' },
                    { name: 'OggOpus', value: 'oggopus' },
                    { name: 'Opus', value: 'opus' },
                    { name: 'WebmOpus', value: 'webmopus' },
                    { name: 'Raw', value: 'raw' },
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const streamUrl = interaction.options.getString('stream');
        const typeOption = interaction.options.getString('type') || 'arbitrary';
        const guildId = interaction.guildId;

        // 1. Connection & Permission Guards
        const connection = getVoiceConnection(guildId);
        if (!connection || !connection.state.subscription?.player) {
            return interaction.reply({ embeds: [errorEmbed('Bot is not connected to a player. Use /connect first.')] });
        }

        if (interaction.member.voice.channel?.id !== interaction.guild.members.me.voice.channel?.id) {
            return interaction.reply({ embeds: [errorEmbed('You must be in the same voice channel as the bot.')] });
        }

        if (!isValidURL(streamUrl)) {
            return interaction.reply({ embeds: [errorEmbed('Please provide a valid HTTP/HTTPS stream URL.')] });
        }

        try {
            const response = await fetch(streamUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            // Update the central memory and get the resource
            const resource = getNextResource(streamUrl);

            if (resource) {
                connection.state.subscription.player.play(resource);
            }

            connection.state.subscription.player.play(resource);

            // 4. Handle Metadata Listener
            if (connection.statsListener) connection.statsListener.stop();

            connection.statsListener = new IcecastMetadataStats(streamUrl, {
                onStats: (stats) => {
                    if (!stats) return;

                    const title = stats.icestats?.source?.[0]?.title || stats.icy?.StreamTitle || stats.ogg?.TITLE || "Unknown Title";
                    const artist = stats.icestats?.source?.[0]?.artist || stats.ogg?.ARTIST || "Unknown Artist";

                    try {
                        interaction.client.user.setActivity(`${title} - ${artist}`, { type: ActivityType.Listening });
                    } catch (e) { /* Rate limit or ephemeral error */ }
                },
                interval: 15,
                sources: ['icy', 'ogg', 'icestats']
            });
            connection.statsListener.start();

            // 5. Finalize Response
            const embed = nowPlayingEmbed(
                response.headers.get('icy-name') || "Custom Stream",
                response.headers.get('icy-genre') || "Various",
                response.headers.get('icy-url') || streamUrl,
                response.headers.get('server') || "Unknown"
            );

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error("Change Command Error:", error);
            return interaction.reply({ embeds: [errorEmbed(`Failed to load stream: ${error.message}`)] });
        }
    },
};