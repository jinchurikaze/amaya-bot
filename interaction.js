const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const GROUPS_TO_CHECK = [
    { id: 34319686, name: "Jin's UGC" },
    { id: 34162917, name: "/affinity" },
    { id: 396199818, name: "Orquidea" },
    { id: 35753423, name: "PATHINGTON" },
    { id: 34323970, name: "Fiji's Domain" },
    { id: 35515467, name: "猫 amaya" }
];

const DAYS_REQUIRED = 14;
const DATA_FILE = path.join(__dirname, '../data/memberTracking.json');

// Store pending overrides temporarily
const pendingOverrides = new Map();

// Ensure data directory exists
function ensureDataDir() {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

// Load tracking data
function loadTrackingData() {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (error) {
        console.error('Error loading tracking data:', error);
        return {};
    }
}

// Save tracking data
function saveTrackingData(data) {
    ensureDataDir();
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving tracking data:', error);
    }
}

// Calculate days since timestamp
function getDaysSince(timestamp) {
    return Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
}

// Parse date string (MM-DD-YYYY)
function parseDate(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!match) return null;
    
    const [, month, day, year] = match;
    const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    
    if (isNaN(date.getTime())) return null;
    if (date.getTime() > Date.now()) return null; // Future date not allowed
    
    return date.getTime();
}

// Format timestamp to readable date
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
    });
}

// Build the main embed
function buildEmbed(username, displayName, userId, userGroups, trackingData) {
    const groupLines = [];
    let eligibleForPayout = false;
    let hasAnyMembership = false;
    let oldestMembership = null;
    const groupsNotIn = [];

    for (const configGroup of GROUPS_TO_CHECK) {
        const membership = userGroups.find(g => g.group.id === configGroup.id);

        if (!membership) {
            groupLines.push(`[${configGroup.name}](https://www.roblox.com/groups/${configGroup.id}) : **Not in Group**`);
            groupsNotIn.push(configGroup);
            continue;
        }

        hasAnyMembership = true;
        const trackingKey = `${userId}_${configGroup.id}`;
        const entry = trackingData[trackingKey];

        if (!entry) {
            groupLines.push(`[${configGroup.name}](https://www.roblox.com/groups/${configGroup.id}) : **In Group** (not yet tracked)`);
            continue;
        }

        const daysSince = getDaysSince(entry.firstSeen);
        const isEligible = daysSince >= DAYS_REQUIRED;
        const joinedStr = formatDate(entry.firstSeen);

        if (isEligible) eligibleForPayout = true;
        if (!oldestMembership || entry.firstSeen < oldestMembership.firstSeen) {
            oldestMembership = entry;
        }

        if (isEligible) {
            groupLines.push(`[${configGroup.name}](https://www.roblox.com/groups/${configGroup.id}) : **Eligible Joined ${joinedStr}**`);
        } else {
            groupLines.push(`[${configGroup.name}](https://www.roblox.com/groups/${configGroup.id}) : Joined ${joinedStr} **(${daysSince}/${DAYS_REQUIRED} days)**`);
        }
    }

    const embedColor = 0x2B2D31; // Dark gray for minimal look

    const embed = new EmbedBuilder()
        .setTitle(`${displayName} ?`)
        .setDescription(groupLines.join('\n'))
        .setColor(embedColor)
        .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`)
        .setTimestamp();

    return { embed, groupsNotIn };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('eligible')
        .setDescription('Check if a Roblox user is eligible for Robux payout')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Roblox username to check')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('groupname')
                .setDescription('Group to set/override join date for')
                .setRequired(false)
                .addChoices(
                    { name: "Jin's UGC", value: "34319686" },
                    { name: "/affinity", value: "34162917" },
                    { name: "Orquidea", value: "396199818" },
                    { name: "PATHINGTON", value: "35753423" },
                    { name: "Fiji's Domain", value: "34323970" },
                    { name: "猫 amaya", value: "35515467" }
                )
        )
        .addStringOption(option =>
            option.setName('joindate')
                .setDescription('Join date for the specified group (format: MM-DD-YYYY, e.g., 01-15-2025)')
                .setRequired(false)
        ),

    pendingOverrides,
    buildEmbed,

    async execute(interaction) {
        await interaction.deferReply();

        const username = interaction.options.getString('username');
        const groupIdOverride = interaction.options.getString('groupname');
        const joinDateStr = interaction.options.getString('joindate');
        const trackingData = loadTrackingData();

        // Validation: joindate requires groupname
        if (joinDateStr && !groupIdOverride) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setDescription('❌ Please select a **groupname** when specifying a join date.')
                    .setColor(0xED4245)
                ]
            });
        }

        // Validation: check date format
        if (joinDateStr) {
            const parsedDate = parseDate(joinDateStr);
            if (parsedDate === null) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setDescription('❌ Invalid date format. Please use **MM-DD-YYYY** (e.g., `01-15-2025`)\n\nMake sure the date is valid and not in the future.')
                        .setColor(0xED4245)
                    ]
                });
            }
        }

        try {
            // Resolve username → user ID
            const userResponse = await axios.post('https://users.roblox.com/v1/usernames/users', {
                usernames: [username],
                excludeBannedUsers: false
            });

            if (!userResponse.data.data?.length) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setDescription(`❌ Could not find Roblox user: **${username}**`)
                        .setColor(0xED4245)
                    ]
                });
            }

            const userId = userResponse.data.data[0].id;
            const displayName = userResponse.data.data[0].displayName;

            // Fetch user's groups
            const groupsResponse = await axios.get(`https://groups.roblox.com/v1/users/${userId}/groups/roles`);
            const userGroups = groupsResponse.data.data;

            // Auto-track any new memberships (first-time detection)
            for (const configGroup of GROUPS_TO_CHECK) {
                const membership = userGroups.find(g => g.group.id === configGroup.id);
                if (!membership) continue;

                const trackingKey = `${userId}_${configGroup.id}`;
                if (!trackingData[trackingKey]) {
                    trackingData[trackingKey] = {
                        userId,
                        username,
                        groupId: configGroup.id,
                        groupName: configGroup.name,
                        firstSeen: Date.now(),
                        role: membership.role.name,
                        rank: membership.role.rank
                    };
                    saveTrackingData(trackingData);
                }
            }

            // Handle manual join date override
            if (joinDateStr && groupIdOverride) {
                const overrideTimestamp = parseDate(joinDateStr);
                const trackingKey = `${userId}_${groupIdOverride}`;
                const configGroup = GROUPS_TO_CHECK.find(g => String(g.id) === String(groupIdOverride));

                // Check if user is actually in the group
                const isInGroup = userGroups.find(g => g.group.id === configGroup.id);
                if (!isInGroup) {
                    return interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setDescription(`❌ **${username}** is not a member of **${configGroup.name}**. Cannot set join date for a group they're not in.`)
                            .setColor(0xED4245)
                        ]
                    });
                }

                // If data exists, ask for confirmation to override
                if (trackingData[trackingKey]) {
                    const existingDate = formatDate(trackingData[trackingKey].firstSeen);
                    const newDate = formatDate(overrideTimestamp);

                    const overrideId = `${interaction.user.id}_${Date.now()}`;
                    pendingOverrides.set(overrideId, {
                        trackingKey,
                        overrideTimestamp,
                        userId,
                        username,
                        displayName,
                        userGroups,
                        groupName: configGroup.name
                    });

                    // Auto-expire after 60 seconds
                    setTimeout(() => pendingOverrides.delete(overrideId), 60_000);

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`override_yes_${overrideId}`)
                            .setLabel('Yes, Override')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId(`override_no_${overrideId}`)
                            .setLabel('No, Keep Existing')
                            .setStyle(ButtonStyle.Secondary)
                    );

                    return interaction.editReply({
                        embeds: [new EmbedBuilder()
                            .setTitle('⚠️ Existing Join Date Found')
                            .setDescription(
                                `**${username}** already has a tracked join date for **${configGroup.name}**.\n\n` +
                                `**Current Join Date:** ${existingDate}\n` +
                                `**New Join Date:** ${newDate}\n\n` +
                                `Do you want to override the existing date?`
                            )
                            .setColor(0xFEE75C)
                        ],
                        components: [row]
                    });
                }

                // No existing data → apply directly
                trackingData[trackingKey] = {
                    userId,
                    username,
                    groupId: configGroup.id,
                    groupName: configGroup.name,
                    firstSeen: overrideTimestamp,
                    role: isInGroup.role.name,
                    rank: isInGroup.role.rank
                };
                saveTrackingData(trackingData);

                // Show success message
                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setDescription(`✅ Join date set for **${username}** in **${configGroup.name}**: ${formatDate(overrideTimestamp)}`)
                        .setColor(0x57F287)
                    ]
                });

                // Wait a moment then show the full embed
                setTimeout(async () => {
                    const { embed, groupsNotIn } = buildEmbed(username, displayName, userId, userGroups, loadTrackingData());
                    
                    const components = [];
                    if (groupsNotIn.length > 0) {
                        const selectMenu = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setLabel('Join our Roblox Group')
                                .setStyle(ButtonStyle.Link)
                                .setURL('https://www.roblox.com/groups/' + groupsNotIn[0].id)
                                .setEmoji('🔗')
                        );
                        components.push(selectMenu);
                    }
                    
                    await interaction.followUp({ 
                        embeds: [embed],
                        components: components
                    });
                }, 1500);

                return;
            }

            // Default: just show eligibility status
            const { embed, groupsNotIn } = buildEmbed(username, displayName, userId, userGroups, loadTrackingData());
            
            // Add "Join our Roblox Group" button if user is not in some groups
            const components = [];
            if (groupsNotIn.length > 0) {
                const selectMenu = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Join our Roblox Group')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://www.roblox.com/groups/' + groupsNotIn[0].id)
                        .setEmoji('🔗')
                );
                components.push(selectMenu);
            }
            
            await interaction.editReply({ 
                embeds: [embed],
                components: components
            });

        } catch (error) {
            console.error('Error in eligible command:', error);
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setDescription('❌ An error occurred while checking the user. Please try again.')
                    .setColor(0xED4245)
                ]
            });
        }
    }
};