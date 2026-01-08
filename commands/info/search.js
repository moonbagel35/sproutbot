const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js'); // Added MessageFlags
const errorEmbed = require('../../embeds/errorEmbed');

module.exports = {
    cooldown: 10,
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Searches for a radio station, powered by radio.garden')
        .addStringOption(
            option => option.setName('query')
                .setDescription('The query to search for')
                .setRequired(true)
        ),
    async execute(interaction) {
        const input = interaction.options.getString('query');

        // Loosen sanitization: allow common punctuation used in station names
        const sanitizedInput = encodeURIComponent(input);

        const response = await fetch(`https://radio.garden/api/search?q=${sanitizedInput}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Origin': 'https://radio.garden',
                'Referer': 'https://radio.garden/'
            }
        });

        const res = await response.json();

// Debug log to see exactly what the API returned
        console.log(`Search query: ${input} | Hits found: ${res.hits?.hits?.length || 0}`);
        try {
            // Radio Garden API Request
            const response = await fetch(`https://radio.garden/api/search?q=${sanitizedInput}`);

            if (!response.ok) throw new Error(`API returned ${response.status}`);

            const res = await response.json();

            // Check the new JSON structure
            if (!res.hits || res.hits.hits.length === 0) {
                return interaction.reply({
                    embeds: [errorEmbed('No results found for your query.')],
                    flags: [MessageFlags.Ephemeral] // Updated from ephemeral: true
                });
            }

            let desc = '';
            res.hits.hits.forEach((hit, index) => {
                // 1. Check if _source and url exist to prevent the 'split' crash
                const source = hit._source;
                if (!source || !source.url) return;

                const title = source.title || 'Unknown Station';
                const subtitle = source.subtitle || '';

                // 2. Safely extract the ID
                const stationId = source.url.split('/').pop();

                desc += `**${title}**\n*${subtitle}*\nID: \`${stationId}\`\n`;

                if (index !== res.hits.hits.length - 1) {
                    desc += '\n';
                }
            });

            desc += '\nUse `/play id:[ID]` to start the stream.';

            const embed = new EmbedBuilder()
                .setTitle(':mag: Search Results')
                .setDescription(desc)
                .setColor('#7490ed')
                .setFooter({
                    text: 'powered by radio.garden',
                    iconURL: 'https://px.radio.garden/small/nkeutQ57.jpg'
                });

            return interaction.reply({
                embeds: [embed],
                flags: [MessageFlags.Ephemeral]
            });

        } catch (error) {
            console.error('Search Pipeline Error:', error);
            return interaction.reply({
                embeds: [errorEmbed('Failed to connect to Radio Garden search service.')],
                flags: [MessageFlags.Ephemeral]
            });
        }
    },
};