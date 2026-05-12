const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const axios = require('axios');
const fs = require('fs');
const path = require('path');

/* =========================
   CONFIG
========================= */

const GROUPS_TO_CHECK = [
    {
        id: 34319686,
        name: "Jin's UGC",
        url: "https://www.roblox.com/communities/34319686"
    },
    {
        id: 34162917,
        name: "/affinity",
        url: "https://www.roblox.com/communities/34162917"
    },
    {
        id: 396199818,
        name: "Orquidea",
        url: "https://www.roblox.com/communities/396199818"
    },
    {
        id: 35753423,
        name: "PATHINGTON",
        url: "https://www.roblox.com/communities/35753423"
    },
    {
        id: 34323970,
        name: "Fiji's Domain",
        url: "https://www.roblox.com/communities/34323970"
    },
    {
        id: 35515467,
        name: "猫 amaya",
        url: "https://www.roblox.com/communities/35515467"
    }
];

const DAYS_REQUIRED = 14;

const DATA_FILE = path.join(
    __dirname,
    '../data/memberTracking.json'
);

const pendingOverrides = new Map();

/* =========================
   DATA FUNCTIONS
========================= */

function ensureDataDir() {

    const dataDir = path.join(
        __dirname,
        '../data'
    );

    if (!fs.existsSync(dataDir)) {

        fs.mkdirSync(dataDir, {
            recursive: true
        });
    }
}

function loadTrackingData() {

    ensureDataDir();

    if (!fs.existsSync(DATA_FILE)) {
        return {};
    }

    try {

        return JSON.parse(
            fs.readFileSync(DATA_FILE, 'utf8')
        );

    } catch (error) {

        console.error(
            'Error loading tracking data:',
            error
        );

        return {};
    }
}

function saveTrackingData(data) {

    ensureDataDir();

    try {

        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(data, null, 2)
        );

    } catch (error) {

        console.error(
            'Error saving tracking data:',
            error
        );
    }
}

/* =========================
   DATE HELPERS
========================= */

function getDaysSince(timestamp) {

    return Math.floor(
        (Date.now() - timestamp) /
        (1000 * 60 * 60 * 24)
    );
}

function parseDate(dateStr) {

    if (!dateStr) return null;

    const match = dateStr.match(
        /^(\d{2})-(\d{2})-(\d{4})$/
    );

    if (!match) return null;

    const [, month, day, year] = match;

    const date = new Date(
        `${year}-${month}-${day}T00:00:00.000Z`
    );

    if (isNaN(date.getTime())) return null;

    if (date.getTime() > Date.now()) return null;

    return date.getTime();
}

function formatDate(timestamp) {

    return new Date(timestamp).toLocaleDateString(
        'en-US',
        {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC'
        }
    );
}

/* =========================
   ROBLOX HELPERS
========================= */

function getRobloxProfile(userId) {

    return `https://www.roblox.com/users/${userId}/profile`;
}

async function fetchAvatar(userId) {

    try {

        const response = await axios.get(
            `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`
        );

        return response.data.data[0]?.imageUrl || null;

    } catch (error) {

        console.error(
            'Error fetching Roblox avatar:',
            error
        );

        return null;
    }
}

/* =========================
   STYLE HELPERS
========================= */

function getStatusIcon(type) {

    const icons = {
        eligible: '▸',
        pending: '•',
        untracked: '•',
        notIn: '×'
    };

    return icons[type] || '•';
}

/* =========================
   EMBED BUILDER
========================= */

function buildEmbed(
    username,
    displayName,
    userId,
    userGroups,
    trackingData,
    avatarURL
) {

    const groupLines = [];
    const groupsNotIn = [];

    for (const configGroup of GROUPS_TO_CHECK) {

        const membership = userGroups.find(
            g => g.group.id === configGroup.id
        );

        /* =========================
           NOT IN GROUP
        ========================= */

        if (!membership) {

            groupLines.push(
                `${getStatusIcon('notIn')} [**${configGroup.name}**](${configGroup.url}) : Not in Group`
            );

            groupsNotIn.push(configGroup);

            continue;
        }

        const trackingKey =
            `${userId}_${configGroup.id}`;

        const entry =
            trackingData[trackingKey];

        /* =========================
           NOT TRACKED
        ========================= */

        if (!entry) {

            groupLines.push(
                `${getStatusIcon('untracked')} [**${configGroup.name}**](${configGroup.url}) : Pending`
            );

            continue;
        }

        const daysSince =
            getDaysSince(entry.firstSeen);

        const joinedStr =
            formatDate(entry.firstSeen);

        /* =========================
           ELIGIBLE
        ========================= */

        if (daysSince >= DAYS_REQUIRED) {

            groupLines.push(
                `${getStatusIcon('eligible')} [**${configGroup.name}**](${configGroup.url}) : Eligible • Joined ${joinedStr}`
            );
        }

        /* =========================
           PENDING
        ========================= */

        else {

            groupLines.push(
                `${getStatusIcon('pending')} [**${configGroup.name}**](${configGroup.url}) : Pending • Joined ${joinedStr}`
            );
        }
    }

    const profileURL =
        getRobloxProfile(userId);

    const spacedGroupLines =
        groupLines.join('\n\n');

    const embed = new EmbedBuilder()

        .setColor('#2B2D31')

        .setTitle(username)

        .setURL(profileURL)

        .setDescription(
            [
                `# ${displayName || username}`,
                ``,
                spacedGroupLines,
                ``,
                `━━━━━━━━━━━━━━━━━━`,
                `Roblox Profile • **${username}** • ${userId}`
            ].join('\n')
        )

        .setFooter({
            text: `Eligibility Checker`
        });

    if (avatarURL) {

        embed
            .setThumbnail(avatarURL)
            .setAuthor({
                name: `@${username}`,
                iconURL: avatarURL
            });
    }

    return {
        embed,
        groupsNotIn
    };
}

/* =========================
   COMMAND
========================= */

module.exports = {

    data: new SlashCommandBuilder()

        .setName('eligible')

        .setDescription(
            'Check if a Roblox user is eligible'
        )

        .addStringOption(option =>

            option
                .setName('username')
                .setDescription(
                    'Roblox username'
                )
                .setRequired(true)
        )

        .addStringOption(option =>

            option
                .setName('groupname')
                .setDescription(
                    'Group to override'
                )
                .setRequired(false)

                .addChoices(
                    {
                        name: "Jin's UGC",
                        value: "34319686"
                    },
                    {
                        name: "/affinity",
                        value: "34162917"
                    },
                    {
                        name: "Orquidea",
                        value: "396199818"
                    },
                    {
                        name: "PATHINGTON",
                        value: "35753423"
                    },
                    {
                        name: "Fiji's Domain",
                        value: "34323970"
                    },
                    {
                        name: "猫 amaya",
                        value: "35515467"
                    }
                )
        )

        .addStringOption(option =>

            option
                .setName('joindate')
                .setDescription(
                    'MM-DD-YYYY'
                )
                .setRequired(false)
        ),

    pendingOverrides,

    buildEmbed,

    async execute(interaction) {

        await interaction.deferReply();

        const username =
            interaction.options.getString(
                'username'
            );

        const groupIdOverride =
            interaction.options.getString(
                'groupname'
            );

        const joinDateStr =
            interaction.options.getString(
                'joindate'
            );

        const trackingData =
            loadTrackingData();

        /* =========================
           VALIDATION
        ========================= */

        if (
            joinDateStr &&
            !groupIdOverride
        ) {

            return interaction.editReply({

                embeds: [

                    new EmbedBuilder()

                        .setColor('#ED4245')

                        .setDescription(
                            'Please select a group.'
                        )
                ]
            });
        }

        if (joinDateStr) {

            const parsedDate =
                parseDate(joinDateStr);

            if (parsedDate === null) {

                return interaction.editReply({

                    embeds: [

                        new EmbedBuilder()

                            .setColor('#ED4245')

                            .setDescription(
                                'Invalid date format.\nUse MM-DD-YYYY'
                            )
                    ]
                });
            }
        }

        try {

            /* =========================
               FETCH USER
            ========================= */

            const userResponse =
                await axios.post(
                    'https://users.roblox.com/v1/usernames/users',
                    {
                        usernames: [username],
                        excludeBannedUsers: false
                    }
                );

            if (
                !userResponse.data.data?.length
            ) {

                return interaction.editReply({

                    embeds: [

                        new EmbedBuilder()

                            .setColor('#ED4245')

                            .setDescription(
                                'User not found.'
                            )
                    ]
                });
            }

            const userData =
                userResponse.data.data[0];

            const userId =
                userData.id;

            const robloxUsername =
                userData.name || username;

            const displayName =
                userData.displayName || robloxUsername;

            const avatarURL =
                await fetchAvatar(userId);

            /* =========================
               FETCH GROUPS
            ========================= */

            const groupsResponse =
                await axios.get(
                    `https://groups.roblox.com/v1/users/${userId}/groups/roles`
                );

            const userGroups =
                groupsResponse.data.data;

            /* =========================
               AUTO TRACK
            ========================= */

            for (const configGroup of GROUPS_TO_CHECK) {

                const membership =
                    userGroups.find(
                        g =>
                            g.group.id ===
                            configGroup.id
                    );

                if (!membership) continue;

                const trackingKey =
                    `${userId}_${configGroup.id}`;

                if (!trackingData[trackingKey]) {

                    trackingData[trackingKey] = {

                        userId,

                        username:
                            robloxUsername,

                        groupId:
                            configGroup.id,

                        groupName:
                            configGroup.name,

                        firstSeen:
                            Date.now(),

                        role:
                            membership.role.name,

                        rank:
                            membership.role.rank
                    };

                    saveTrackingData(
                        trackingData
                    );
                }
            }

            /* =========================
               OVERRIDE DATE
            ========================= */

            if (
                joinDateStr &&
                groupIdOverride
            ) {

                const overrideTimestamp =
                    parseDate(joinDateStr);

                const configGroup =
                    GROUPS_TO_CHECK.find(
                        g =>
                            String(g.id) ===
                            String(groupIdOverride)
                    );

                const trackingKey =
                    `${userId}_${groupIdOverride}`;

                trackingData[trackingKey] = {

                    userId,

                    username:
                        robloxUsername,

                    groupId:
                        configGroup.id,

                    groupName:
                        configGroup.name,

                    firstSeen:
                        overrideTimestamp
                };

                saveTrackingData(
                    trackingData
                );

                await interaction.followUp({

                    embeds: [

                        new EmbedBuilder()

                            .setColor('#57F287')

                            .setDescription(
                                `Join date updated for **${configGroup.name}**`
                            )
                    ]
                });
            }

            /* =========================
               MAIN EMBED
            ========================= */

            const {
                embed,
                groupsNotIn
            } = buildEmbed(
                robloxUsername,
                displayName,
                userId,
                userGroups,
                loadTrackingData(),
                avatarURL
            );

            const components = [];

            if (groupsNotIn.length > 0) {

                const row =
                    new ActionRowBuilder()

                        .addComponents(

                            new ButtonBuilder()

                                .setLabel(
                                    'Join our Roblox Group'
                                )

                                .setStyle(
                                    ButtonStyle.Link
                                )

                                .setURL(
                                    groupsNotIn[0].url
                                )
                        );

                components.push(row);
            }

            await interaction.editReply({

                embeds: [embed],

                components
            });

        } catch (error) {

            console.error(error);

            await interaction.editReply({

                embeds: [

                    new EmbedBuilder()

                        .setColor('#ED4245')

                        .setDescription(
                            'Something went wrong.'
                        )
                ]
            });
        }
    }
};