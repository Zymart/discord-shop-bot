const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const fs = require('fs');
const axios = require('axios');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

const OWNER_ID = '730629579533844512';

// JSONBin Configuration
const JSONBIN_API_KEY = process.env.JSONBIN_API_KEY || '';
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID || '';
const CONFIG_BIN_ID = process.env.CONFIG_BIN_ID || '';

// Store pagination data and ticket trackers
const paginationData = new Map();
const ticketTimers = new Map();

// JSONBin API functions
async function loadFromJSONBin(binId) {
    if (!JSONBIN_API_KEY || !binId) {
        console.log('JSONBin not configured, using local files');
        return null;
    }

    try {
        const response = await axios.get(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
            headers: {
                'X-Master-Key': JSONBIN_API_KEY
            }
        });
        return response.data.record;
    } catch (error) {
        console.error('Error loading from JSONBin:', error.message);
        return null;
    }
}

async function saveToJSONBin(binId, data) {
    if (!JSONBIN_API_KEY || !binId) {
        console.log('JSONBin not configured, using local files');
        return false;
    }

    try {
        await axios.put(`https://api.jsonbin.io/v3/b/${binId}`, data, {
            headers: {
                'X-Master-Key': JSONBIN_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Error saving to JSONBin:', error.message);
        return false;
    }
}

// Load data
async function loadData() {
    const cloudData = await loadFromJSONBin(JSONBIN_BIN_ID);
    if (cloudData) return cloudData;

    if (fs.existsSync('./listings.json')) {
        return JSON.parse(fs.readFileSync('./listings.json', 'utf8'));
    }
    return { sell: [], trade_looking: [], trade_offering: [] };
}

// Save data
async function saveData(data) {
    await saveToJSONBin(JSONBIN_BIN_ID, data);
    fs.writeFileSync('./listings.json', JSON.stringify(data, null, 4));
}

// Load config
async function loadConfig() {
    const cloudConfig = await loadFromJSONBin(CONFIG_BIN_ID);
    if (cloudConfig) return cloudConfig;

    if (fs.existsSync('./config.json')) {
        return JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    }
    return { announcement_channel: null, shop_category: null, admins: [] };
}

// Save config
async function saveConfig(config) {
    await saveToJSONBin(CONFIG_BIN_ID, config);
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
}

// Check if user is admin
async function isAdmin(member) {
    try {
        const config = await loadConfig();
        if (!config || !config.admins) {
            return member.permissions.has(PermissionFlagsBits.Administrator) || member.id === OWNER_ID;
        }
        return member.permissions.has(PermissionFlagsBits.Administrator) || 
               config.admins.includes(member.id) || 
               member.id === OWNER_ID;
    } catch (error) {
        console.error('Error checking admin:', error);
        return member.permissions.has(PermissionFlagsBits.Administrator) || member.id === OWNER_ID;
    }
}

// Validate URL
function isValidUrl(string) {
    if (!string) return false;
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Show buy page
async function showBuyPage(interaction, data, page, isUpdate) {
    const totalPages = data.sell.length;
    const item = data.sell[page];

    if (!item) {
        return interaction.reply({ content: '❌ Item not found!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle(`🛒 Item for Sale - ${item.name}`)
        .setDescription(`**Page ${page + 1} of ${totalPages}**`)
        .setColor(0x00FF00)
        .addFields(
            { name: '💰 Price', value: item.price, inline: true },
            { name: '📦 Stock', value: item.stock, inline: true },
            { name: '👤 Seller', value: `<@${item.seller_id}>`, inline: true }
        )
        .setFooter({ text: `Item #${page + 1}` })
        .setTimestamp();

    if (item.image && isValidUrl(item.image)) {
        embed.setImage(item.image);
    }

    const rows = [];

    const contactRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`contact_seller_${page}`)
                .setLabel('Contact Seller')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📞')
        );
    rows.push(contactRow);

    if (totalPages > 1) {
        const navRow = new ActionRowBuilder();

        if (page > 0) {
            navRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`buy_page_${page - 1}`)
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );
        }

        if (page < totalPages - 1) {
            navRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`buy_page_${page + 1}`)
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('➡️')
            );
        }

        rows.push(navRow);
    }

    if (isUpdate) {
        await interaction.update({ embeds: [embed], components: rows });
    } else {
        await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
}

// Show trade offers page
async function showTradeOffersPage(interaction, data, page, isUpdate) {
    const totalPages = data.trade_offering.length;
    const item = data.trade_offering[page];

    if (!item) {
        return interaction.reply({ content: '❌ Trade offer not found!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle(`🔄 Trade Offer - ${item.item_name}`)
        .setDescription(`**Page ${page + 1} of ${totalPages}**`)
        .setColor(0xFFD700)
        .addFields(
            { name: '📦 Offering', value: item.item_name, inline: false },
            { name: '💭 Owner Wants', value: item.want, inline: false },
            { name: '👤 Owner', value: `<@${item.user_id}>`, inline: true }
        )
        .setFooter({ text: `Trade #${page + 1}` })
        .setTimestamp();

    if (item.image && isValidUrl(item.image)) {
        embed.setImage(item.image);
    }

    const rows = [];

    const offerRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`make_offer_${page}`)
                .setLabel('Make an Offer')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🤝')
        );
    rows.push(offerRow);

    if (totalPages > 1) {
        const navRow = new ActionRowBuilder();

        if (page > 0) {
            navRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`trade_page_${page - 1}`)
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⬅️')
            );
        }

        if (page < totalPages - 1) {
            navRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`trade_page_${page + 1}`)
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('➡️')
            );
        }

        rows.push(navRow);
    }

    if (isUpdate) {
        await interaction.update({ embeds: [embed], components: rows });
    } else {
        await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
}

// Start ticket reminder
function startTicketReminder(channelId, buyerId, sellerId) {
    const timer = setTimeout(async () => {
        try {
            const channel = await client.channels.fetch(channelId);
            await channel.send(`📢 Reminder: <@${buyerId}> <@${sellerId}> - Don't forget to complete your transaction!`);
            startTicketReminder(channelId, buyerId, sellerId);
        } catch (error) {
            console.error('Error sending ticket reminder:', error);
            ticketTimers.delete(channelId);
        }
    }, 24 * 60 * 60 * 1000);

    ticketTimers.set(channelId, { timer, buyerId, sellerId });
}

// Reset ticket timer
function resetTicketTimer(channelId) {
    const timerData = ticketTimers.get(channelId);
    if (timerData) {
        clearTimeout(timerData.timer);
        startTicketReminder(channelId, timerData.buyerId, timerData.sellerId);
    }
}

client.on('ready', () => {
    console.log(`${client.user.tag} is now online!`);
    console.log('JSONBin Status:', JSONBIN_API_KEY ? '✅ Configured' : '❌ Not configured (using local storage)');

    // Initialize data files if they don't exist
    if (!fs.existsSync('./listings.json')) {
        fs.writeFileSync('./listings.json', JSON.stringify({ sell: [], trade_looking: [], trade_offering: [] }, null, 4));
    }
    if (!fs.existsSync('./config.json')) {
        fs.writeFileSync('./config.json', JSON.stringify({ announcement_channel: null, shop_category: null, admins: [] }, null, 4));
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.channel.name.startsWith('ticket-') || message.channel.name.startsWith('trade-')) {
        resetTicketTimer(message.channel.id);
    }

    if (message.content === '!shop') {
        if (!(await isAdmin(message.member))) {
            return message.reply('❌ You need administrator permissions to use this command!');
        }

        const embed = new EmbedBuilder()
            .setTitle('🏪 Shop & Trade System')
            .setDescription('Choose an option below:')
            .setColor(0x0099FF)
            .addFields(
                { name: '🟢 Buy', value: 'Browse items for sale', inline: false },
                { name: '🔵 Trade', value: 'Trade items with other players', inline: false },
                { name: '🔴 Sell', value: 'List your items for sale', inline: false },
                { name: '🗑️ Remove Listing', value: 'Remove your items from shop', inline: false },
                { name: '🛡️ Remove (Admin)', value: 'Remove any item from shop (Admin only)', inline: false }
            );

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('buy')
                    .setLabel('Buy')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('trade')
                    .setLabel('Trade')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('sell')
                    .setLabel('Sell')
                    .setStyle(ButtonStyle.Danger)
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('remove_listing_menu')
                    .setLabel('Remove Listing')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🗑️'),
                new ButtonBuilder()
                    .setCustomId('admin_remove_menu')
                    .setLabel('Remove (Admin)')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🛡️')
            );

        await message.channel.send({ embeds: [embed], components: [row1, row2] });
    }

    if (message.content === '!clearshop') {
        if (!(await isAdmin(message.member))) {
            return message.reply('❌ You need administrator permissions to use this command!');
        }

        const data = { sell: [], trade_looking: [], trade_offering: [] };
        await saveData(data);
        await message.reply('✅ All shop listings have been cleared!');
    }

    if (message.content === '!viewtrades') {
        const data = await loadData();
        const embed = new EmbedBuilder()
            .setTitle('📋 Active Trade Offers')
            .setColor(0xFFD700);

        if (data.trade_offering.length > 0) {
            let offeringText = '';
            data.trade_offering.forEach((item, idx) => {
                offeringText += `${idx + 1}. **${item.item_name}** → wants: ${item.want} (<@${item.user_id}>)\n`;
            });
            embed.addFields({ name: '🔄 Trading For', value: offeringText, inline: false });
        } else {
            embed.setDescription('No active trades yet!');
        }

        await message.channel.send({ embeds: [embed] });
    }

    if (message.content.startsWith('!setchannel')) {
        if (!(await isAdmin(message.member))) {
            return message.reply('❌ You need administrator permissions to use this command!');
        }

        const config = await loadConfig();
        config.announcement_channel = message.channel.id;
        await saveConfig(config);

        await message.reply('✅ This channel will now receive shop and trade announcements!');
    }

    if (message.content.startsWith('!setshop')) {
        if (!(await isAdmin(message.member))) {
            return message.reply('❌ You need administrator permissions to use this command!');
        }

        const args = message.content.split(' ');
        if (args.length < 2) {
            return message.reply('❌ Usage: `!setshop <category_id>`\n\nTo get category ID:\n1. Enable Developer Mode (User Settings > Advanced)\n2. Right-click a category > Copy ID');
        }

        const categoryId = args[1];

        try {
            const category = await message.guild.channels.fetch(categoryId);
            if (category.type !== ChannelType.GuildCategory) {
                return message.reply('❌ That ID is not a category!');
            }

            const config = await loadConfig();
            config.shop_category = categoryId;
            await saveConfig(config);

            await message.reply(`✅ Tickets will now be created in the **${category.name}** category!`);
        } catch (error) {
            await message.reply('❌ Invalid category ID! Make sure you copied it correctly.');
        }
    }

    if (message.content.startsWith('!addadm')) {
        if (message.author.id !== OWNER_ID) {
            return message.reply('❌ Only the bot owner can use this command!');
        }

        const args = message.content.split(' ');
        if (args.length < 2) {
            return message.reply('❌ Usage: `!addadm <user_id>` or `!addadm @user`');
        }

        let userId = args[1].replace(/[<@!>]/g, '');

        const config = await loadConfig();

        if (!config.admins) {
            config.admins = [];
        }

        if (config.admins.includes(userId)) {
            return message.reply('❌ That user is already a bot admin!');
        }

        config.admins.push(userId);
        await saveConfig(config);

        await message.reply(`✅ <@${userId}> is now a bot admin! They can now use admin commands.`);
    }

    if (message.content.startsWith('!remadm')) {
        if (message.author.id !== OWNER_ID) {
            return message.reply('❌ Only the bot owner can use this command!');
        }

        const args = message.content.split(' ');
        if (args.length < 2) {
            return message.reply('❌ Usage: `!remadm <user_id>` or `!remadm @user`');
        }

        let userId = args[1].replace(/[<@!>]/g, '');

        const config = await loadConfig();

        if (!config.admins) {
            config.admins = [];
        }

        if (!config.admins.includes(userId)) {
            return message.reply('❌ That user is not a bot admin!');
        }

        config.admins = config.admins.filter(id => id !== userId);
        await saveConfig(config);

        await message.reply(`✅ <@${userId}> is no longer a bot admin.`);
    }

    if (message.content.startsWith('!listadm')) {
        if (message.author.id !== OWNER_ID) {
            return message.reply('❌ Only the bot owner can use this command!');
        }

        const config = await loadConfig();

        if (!config.admins || config.admins.length === 0) {
            return message.reply('📋 There are no bot admins set yet.');
        }

        const embed = new EmbedBuilder()
            .setTitle('🛡️ Bot Admins')
            .setDescription(config.admins.map(id => `• <@${id}>`).join('\n'))
            .setColor(0x0099FF)
            .setFooter({ text: `Total: ${config.admins.length}` });

        await message.reply({ embeds: [embed] });
    }

    if (message.content.startsWith('!removelisting')) {
        return message.reply('💡 Please use the **Remove Listing** button in `!shop` instead!');
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton() && !interaction.isModalSubmit()) return;

    const data = await loadData();

    if (interaction.customId === 'buy') {
        if (data.sell.length === 0) {
            return interaction.reply({ content: 'No items available for sale yet!', ephemeral: true });
        }
        await showBuyPage(interaction, data, 0, false);
    }

    if (interaction.customId.startsWith('buy_page_')) {
        const page = parseInt(interaction.customId.split('_')[2]);
        await showBuyPage(interaction, data, page, true);
    }

    if (interaction.customId === 'trade') {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('look_for')
                    .setLabel('Look For')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('trading_for')
                    .setLabel('Trading For')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.reply({ content: 'Choose a trade option:', components: [row], ephemeral: true });
    }

    if (interaction.customId === 'sell') {
        const modal = new ModalBuilder()
            .setCustomId('sell_modal')
            .setTitle('List Item for Sale');

        const itemNameInput = new TextInputBuilder()
            .setCustomId('item_name')
            .setLabel('Name of Item')
            .setPlaceholder('Enter item name...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const priceInput = new TextInputBuilder()
            .setCustomId('price')
            .setLabel('Price')
            .setPlaceholder('Enter price (e.g., 1000 coins)...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const stockInput = new TextInputBuilder()
            .setCustomId('stock')
            .setLabel('Stock')
            .setPlaceholder('Enter quantity available...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const imageInput = new TextInputBuilder()
            .setCustomId('image_url')
            .setLabel('Image URL (Optional)')
            .setPlaceholder('Upload image to Discord, right-click, Copy Link...')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(itemNameInput),
            new ActionRowBuilder().addComponents(priceInput),
            new ActionRowBuilder().addComponents(stockInput),
            new ActionRowBuilder().addComponents(imageInput)
        );

        await interaction.showModal(modal);
    }

    if (interaction.customId === 'look_for') {
        if (data.trade_offering.length === 0) {
            return interaction.reply({ content: 'No trade offers available yet!', ephemeral: true });
        }
        await showTradeOffersPage(interaction, data, 0, false);
    }

    if (interaction.customId.startsWith('trade_page_')) {
        const page = parseInt(interaction.customId.split('_')[2]);
        await showTradeOffersPage(interaction, data, page, true);
    }

    if (interaction.customId === 'trading_for') {
        const modal = new ModalBuilder()
            .setCustomId('trading_for_modal')
            .setTitle('List Item for Trade');

        const itemNameInput = new TextInputBuilder()
            .setCustomId('item_name')
            .setLabel('Name of the Item (What you have)')
            .setPlaceholder('Enter the item you want to trade...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const wantInput = new TextInputBuilder()
            .setCustomId('want')
            .setLabel('What do you want for it?')
            .setPlaceholder('Enter what you want in exchange...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        const imageInput = new TextInputBuilder()
            .setCustomId('image_url')
            .setLabel('Image URL (Optional)')
            .setPlaceholder('Upload image to Discord, right-click, Copy Link...')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(itemNameInput),
            new ActionRowBuilder().addComponents(wantInput),
            new ActionRowBuilder().addComponents(imageInput)
        );

        await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('make_offer_')) {
        const itemIndex = parseInt(interaction.customId.split('_')[2]);
        const tradeOffer = data.trade_offering[itemIndex];

        if (!tradeOffer) {
            return interaction.reply({ content: '❌ Trade offer not found!', ephemeral: true });
        }

        const modal = new ModalBuilder()
            .setCustomId(`offer_modal_${itemIndex}`)
            .setTitle(`Offer for ${tradeOffer.item_name}`);

        const offerInput = new TextInputBuilder()
            .setCustomId('your_offer')
            .setLabel(`What do you want to offer?`)
            .setPlaceholder(`Owner wants: ${tradeOffer.want}`)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(offerInput)
        );

        await interaction.showModal(modal);
    }

    if (interaction.customId.startsWith('contact_seller_')) {
        const itemIndex = parseInt(interaction.customId.split('_')[2]);
        const item = data.sell[itemIndex];

        if (!item) {
            return interaction.reply({ content: '❌ Item not found!', ephemeral: true });
        }

        const guild = interaction.guild;
        const config = await loadConfig();
        const ticketName = `ticket-${interaction.user.username}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

        try {
            const channelOptions = {
                name: ticketName,
                type: ChannelType.GuildText,
                topic: `Ticket for ${item.name} - Buyer: ${interaction.user.tag} | Seller: ${item.seller_name}`,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    },
                    {
                        id: item.seller_id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    },
                ],
            };

            if (config.shop_category) {
                channelOptions.parent = config.shop_category;
            }

            const ticketChannel = await guild.channels.create(channelOptions);

            const ticketEmbed = new EmbedBuilder()
                .setTitle('🎫 Purchase Ticket Created')
                .setDescription(`**Item:** ${item.name}\n**Price:** ${item.price}\n**Stock:** ${item.stock}`)
                .setColor(0x00FF00)
                .addFields(
                    { name: '👤 Buyer', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🏪 Seller', value: `<@${item.seller_id}>`, inline: true }
                )
                .setFooter({ text: 'You will receive a reminder every 24 hours if no one chats' })
                .setTimestamp();

            if (item.image && isValidUrl(item.image)) {
                ticketEmbed.setThumbnail(item.image);
            }

            const closeButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Close Ticket')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒')
                );

            await ticketChannel.send({ 
                content: `<@${interaction.user.id}> <@${item.seller_id}>`,
                embeds: [ticketEmbed], 
                components: [closeButton] 
            });

            startTicketReminder(ticketChannel.id, interaction.user.id, item.seller_id);

            await interaction.reply({ 
                content: `✅ Ticket created! Go to <#${ticketChannel.id}> to talk with the seller.`, 
                ephemeral: true 
            });

        } catch (error) {
            console.error('Error creating ticket:', error);
            await interaction.reply({ 
                content: '❌ Failed to create ticket. Make sure the bot has permission to create channels!', 
                ephemeral: true 
            });
        }
    }

    if (interaction.customId === 'close_ticket') {
        const channel = interaction.channel;

        const timerData = ticketTimers.get(channel.id);
        if (timerData) {
            clearTimeout(timerData.timer);
            ticketTimers.delete(channel.id);
        }

        await interaction.reply('🔒 Closing ticket in 5 seconds...');

        setTimeout(async () => {
            try {
                await channel.delete();
            } catch (error) {
                console.error('Error deleting channel:', error);
            }
        }, 5000);
    }

    if (interaction.customId.startsWith('accept_trade_')) {
        const offererId = interaction.customId.split('_')[2];

        await interaction.update({ 
            content: `✅ Trade accepted! <@${offererId}> you can now join this channel to finalize the trade.`,
            components: [] 
        });

        try {
            await interaction.channel.permissionOverwrites.create(offererId, {
                ViewChannel: true,
                SendMessages: true,
            });

            const tradeEmbed = new EmbedBuilder()
                .setTitle('✅ Trade Accepted!')
                .setDescription(`<@${offererId}> has been added to the channel. Please discuss and complete your trade here.`)
                .setColor(0x00FF00)
                .setFooter({ text: 'You will receive a reminder every 24 hours if no one chats' });

            const closeButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_trade_channel')
                        .setLabel('Close Trade Channel')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔒')
                );

            await interaction.channel.send({ embeds: [tradeEmbed], components: [closeButton] });

            startTicketReminder(interaction.channel.id, offererId, interaction.user.id);

        } catch (error) {
            console.error('Error adding user to channel:', error);
        }
    }

    if (interaction.customId.startsWith('decline_trade_')) {
        await interaction.update({ 
            content: `❌ Trade declined. This channel will close in 10 seconds.`,
            components: [] 
        });

        setTimeout(async () => {
            try {
                await interaction.channel.delete();
            } catch (error) {
                console.error('Error deleting channel:', error);
            }
        }, 10000);
    }

    if (interaction.customId === 'close_trade_channel') {
        const channel = interaction.channel;

        const timerData = ticketTimers.get(channel.id);
        if (timerData) {
            clearTimeout(timerData.timer);
            ticketTimers.delete(channel.id);
        }

        await interaction.reply('🔒 Closing trade channel in 5 seconds...');

        setTimeout(async () => {
            try {
                await channel.delete();
            } catch (error) {
                console.error('Error deleting channel:', error);
            }
        }, 5000);
    }

    if (interaction.customId.startsWith('remove_listing_') || interaction.customId === 'admin_remove_menu') {
        if (interaction.customId === 'admin_remove_menu') {
            if (!(await isAdmin(interaction.member))) {
                return interaction.reply({ content: '❌ Only admins can use this feature!', ephemeral: true });
            }

            const allSellListings = data.sell.map((item, index) => ({ ...item, index, type: 'sell' }));
            const allTradeListings = data.trade_offering.map((item, index) => ({ ...item, index, type: 'trade' }));
            const allListings = [...allSellListings, ...allTradeListings];

            if (allListings.length === 0) {
                return interaction.reply({ content: '❌ There are no active listings!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('🛡️ All Active Listings (Admin)')
                .setDescription('Click the number button to remove any listing')
                .setColor(0xFF0000);

            allListings.forEach((item, idx) => {
                if (item.type === 'sell') {
                    embed.addFields({
                        name: `${idx + 1}. 🛒 ${item.name}`,
                        value: `**Type:** For Sale\n**Price:** ${item.price}\n**Stock:** ${item.stock}\n**Seller:** <@${item.seller_id}>`,
                        inline: false
                    });
                } else {
                    embed.addFields({
                        name: `${idx + 1}. 🔄 ${item.item_name}`,
                        value: `**Type:** Trade Offer\n**Want:** ${item.want}\n**Owner:** <@${item.user_id}>`,
                        inline: false
                    });
                }
            });

            const rows = [];
            for (let i = 0; i < Math.min(allListings.length, 25); i += 5) {
                const row = new ActionRowBuilder();
                const end = Math.min(i + 5, allListings.length);

                for (let j = i; j < end; j++) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`admin_remove_item_${j}`)
                            .setLabel(`${j + 1}`)
                            .setStyle(ButtonStyle.Danger)
                    );
                }
                rows.push(row);
            }

            return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
        }

        if (interaction.customId === 'remove_listing_menu') {
            const userSellListings = data.sell
                .map((item, index) => ({ ...item, index, type: 'sell' }))
                .filter(item => item.seller_id === interaction.user.id);

            const userTradeListings = data.trade_offering
                .map((item, index) => ({ ...item, index, type: 'trade' }))
                .filter(item => item.user_id === interaction.user.id);

            const allListings = [...userSellListings, ...userTradeListings];

            if (allListings.length === 0) {
                return interaction.reply({ content: '❌ You don\'t have any active listings!', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('Your Active Listings')
                .setDescription('Click the number button to remove that listing')
                .setColor(0xFF0000);

            allListings.forEach((item, idx) => {
                if (item.type === 'sell') {
                    embed.addFields({
                        name: `${idx + 1}. 🛒 ${item.name}`,
                        value: `**Type:** For Sale\n**Price:** ${item.price}\n**Stock:** ${item.stock}`,
                        inline: false
                    });
                } else {
                    embed.addFields({
                        name: `${idx + 1}. 🔄 ${item.item_name}`,
                        value: `**Type:** Trade Offer\n**Want:** ${item.want}`,
                        inline: false
                    });
                }
            });

            const rows = [];
            for (let i = 0; i < Math.min(allListings.length, 25); i += 5) {
                const row = new ActionRowBuilder();
                const end = Math.min(i + 5, allListings.length);

                for (let j = i; j < end; j++) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`remove_listing_${interaction.user.id}_${j}`)
                            .setLabel(`${j + 1}`)
                            .setStyle(ButtonStyle.Danger)
                    );
                }
                rows.push(row);
            }

            return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
        }

        const parts = interaction.customId.split('_');
        const userId = parts[2];
        const listingIdx = parseInt(parts[3]);

        if (userId !== interaction.user.id) {
            return interaction.reply({ content: '❌ You can only remove your own listings!', ephemeral: true });
        }

        const userSellListings = data.sell
            .map((item, index) => ({ ...item, index, type: 'sell' }))
            .filter(item => item.seller_id === interaction.user.id);

        const userTradeListings = data.trade_offering
            .map((item, index) => ({ ...item, index, type: 'trade' }))
            .filter(item => item.user_id === interaction.user.id);

        const allListings = [...userSellListings, ...userTradeListings];
        const listingToRemove = allListings[listingIdx];

        if (!listingToRemove) {
            return interaction.reply({ content: '❌ Listing not found!', ephemeral: true });
        }

        if (listingToRemove.type === 'sell') {
            data.sell.splice(listingToRemove.index, 1);
            await interaction.reply({ content: `✅ Removed **${listingToRemove.name}** from sale listings!`, ephemeral: true });
        } else {
            data.trade_offering.splice(listingToRemove.index, 1);
            await interaction.reply({ content: `✅ Removed **${listingToRemove.item_name}** from trade listings!`, ephemeral: true });
        }

        await saveData(data);

        try {
            await interaction.message.edit({ components: [] });
        } catch (error) {
            console.error('Error updating message:', error);
        }
    }

    if (interaction.customId.startsWith('admin_remove_item_')) {
        if (!(await isAdmin(interaction.member))) {
            return interaction.reply({ content: '❌ Only admins can use this feature!', ephemeral: true });
        }

        const listingIdx = parseInt(interaction.customId.split('_')[3]);

        const allSellListings = data.sell.map((item, index) => ({ ...item, index, type: 'sell' }));
        const allTradeListings = data.trade_offering.map((item, index) => ({ ...item, index, type: 'trade' }));
        const allListings = [...allSellListings, ...allTradeListings];
        const listingToRemove = allListings[listingIdx];

        if (!listingToRemove) {
            return interaction.reply({ content: '❌ Listing not found!', ephemeral: true });
        }

        if (listingToRemove.type === 'sell') {
            const removedItem = data.sell[listingToRemove.index];
            data.sell.splice(listingToRemove.index, 1);
            await interaction.reply({ 
                content: `✅ Removed **${removedItem.name}** by <@${removedItem.seller_id}> from sale listings!`, 
                ephemeral: true 
            });
        } else {
            const removedItem = data.trade_offering[listingToRemove.index];
            data.trade_offering.splice(listingToRemove.index, 1);
            await interaction.reply({ 
                content: `✅ Removed **${removedItem.item_name}** by <@${removedItem.user_id}> from trade listings!`, 
                ephemeral: true 
            });
        }

        await saveData(data);

        try {
            await interaction.message.edit({ components: [] });
        } catch (error) {
            console.error('Error updating message:', error);
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('offer_modal_')) {
            const itemIndex = parseInt(interaction.customId.split('_')[2]);
            const tradeOffer = data.trade_offering[itemIndex];
            const yourOffer = interaction.fields.getTextInputValue('your_offer');

            if (!tradeOffer) {
                return interaction.reply({ content: '❌ Trade offer not found!', ephemeral: true });
            }

            const guild = interaction.guild;
            const config = await loadConfig();
            const channelName = `trade-${interaction.user.username}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

            try {
                const adminRole = guild.roles.cache.find(role => 
                    role.permissions.has(PermissionFlagsBits.Administrator)
                );

                const permissionOverwrites = [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: tradeOffer.user_id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    },
                ];

                if (adminRole) {
                    permissionOverwrites.push({
                        id: adminRole.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    });
                }

                const channelOptions = {
                    name: channelName,
                    type: ChannelType.GuildText,
                    topic: `Trade Confirmation - ${tradeOffer.item_name}`,
                    permissionOverwrites: permissionOverwrites,
                };

                if (config.shop_category) {
                    channelOptions.parent = config.shop_category;
                }

                const tradeChannel = await guild.channels.create(channelOptions);

                const confirmEmbed = new EmbedBuilder()
                    .setTitle('🤝 Trade Offer Pending')
                    .setDescription(`<@${tradeOffer.user_id}>, someone wants to trade with you!`)
                    .setColor(0xFFD700)
                    .addFields(
                        { name: '📦 Your Item', value: tradeOffer.item_name, inline: true },
                        { name: '💭 You Want', value: tradeOffer.want, inline: true },
                        { name: '🎁 Offer from ' + interaction.user.username, value: yourOffer, inline: false }
                    )
                    .setFooter({ text: 'Item owner: Accept or decline this offer' })
                    .setTimestamp();

                const confirmButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`accept_trade_${interaction.user.id}`)
                            .setLabel('Accept Offer')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('✅'),
                        new ButtonBuilder()
                            .setCustomId(`decline_trade_${interaction.user.id}`)
                            .setLabel('Decline Offer')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('❌')
                    );

                await tradeChannel.send({ 
                    content: `<@${tradeOffer.user_id}> ${adminRole ? adminRole.toString() : ''}`,
                    embeds: [confirmEmbed], 
                    components: [confirmButtons] 
                });

                await interaction.reply({ 
                    content: `✅ Your offer has been sent! Wait for the owner to respond in <#${tradeChannel.id}>`, 
                    ephemeral: true 
                });

            } catch (error) {
                console.error('Error creating trade channel:', error);
                await interaction.reply({ 
                    content: '❌ Failed to create trade channel. Make sure the bot has permission to create channels!', 
                    ephemeral: true 
                });
            }
        }

        if (interaction.customId === 'sell_modal') {
            const itemName = interaction.fields.getTextInputValue('item_name');
            const price = interaction.fields.getTextInputValue('price');
            const stock = interaction.fields.getTextInputValue('stock');
            let imageUrl = interaction.fields.getTextInputValue('image_url') || null;

            if (imageUrl && !isValidUrl(imageUrl)) {
                return interaction.reply({ 
                    content: '❌ Invalid image URL! Please provide a valid URL or leave it empty.\n\nTip: Upload image to Discord, right-click, and select "Copy Link"', 
                    ephemeral: true 
                });
            }

            const listing = {
                name: itemName,
                price: price,
                stock: stock,
                seller_id: interaction.user.id,
                seller_name: interaction.user.username,
                image: imageUrl
            };

            data.sell.push(listing);
            await saveData(data);

            const embed = new EmbedBuilder()
                .setTitle('✅ Item Listed for Sale!')
                .setColor(0x00FF00)
                .addFields(
                    { name: 'Item', value: itemName, inline: false },
                    { name: 'Price', value: price, inline: true },
                    { name: 'Stock', value: stock, inline: true }
                );

            if (imageUrl && isValidUrl(imageUrl)) {
                embed.setImage(imageUrl);
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });

            const config = await loadConfig();
            if (config.announcement_channel) {
                try {
                    const announcementChannel = await client.channels.fetch(config.announcement_channel);

                    const announceEmbed = new EmbedBuilder()
                        .setTitle('🆕 New Item for Sale!')
                        .setDescription(`**${itemName}** is now available!`)
                        .setColor(0x00FF00)
                        .addFields(
                            { name: '💰 Price', value: price, inline: true },
                            { name: '📦 Stock', value: stock, inline: true },
                            { name: '👤 Seller', value: `<@${interaction.user.id}>`, inline: true }
                        )
                        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
                        .setTimestamp();

                    if (imageUrl && isValidUrl(imageUrl)) {
                        announceEmbed.setImage(imageUrl);
                    }

                    const itemIndex = data.sell.length - 1;
                    const buyButton = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`contact_seller_${itemIndex}`)
                                .setLabel('Contact Seller')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('📞')
                        );

                    await announcementChannel.send({ embeds: [announceEmbed], components: [buyButton] });
                } catch (error) {
                    console.error('Error posting announcement:', error);
                }
            }
        }

        if (interaction.customId === 'trading_for_modal') {
            const itemName = interaction.fields.getTextInputValue('item_name');
            const want = interaction.fields.getTextInputValue('want');
            let imageUrl = interaction.fields.getTextInputValue('image_url') || null;

            if (imageUrl && !isValidUrl(imageUrl)) {
                return interaction.reply({ 
                    content: '❌ Invalid image URL! Please provide a valid URL or leave it empty.\n\nTip: Upload image to Discord, right-click, and select "Copy Link"', 
                    ephemeral: true 
                });
            }

            const listing = {
                item_name: itemName,
                want: want,
                user_id: interaction.user.id,
                user_name: interaction.user.username,
                image: imageUrl
            };

            data.trade_offering.push(listing);
            await saveData(data);

            const embed = new EmbedBuilder()
                .setTitle('✅ Trade Listing Created!')
                .setColor(0x0099FF)
                .addFields(
                    { name: 'Trading', value: itemName, inline: false },
                    { name: 'Looking For', value: want, inline: false }
                );

            if (imageUrl && isValidUrl(imageUrl)) {
                embed.setImage(imageUrl);
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });

            const config = await loadConfig();
            if (config.announcement_channel) {
                try {
                    const announcementChannel = await client.channels.fetch(config.announcement_channel);

                    const announceEmbed = new EmbedBuilder()
                        .setTitle('🔄 New Trade Offer!')
                        .setDescription(`**${itemName}** is available for trade!`)
                        .setColor(0x0099FF)
                        .addFields(
                            { name: '📦 Offering', value: itemName, inline: false },
                            { name: '💭 Looking For', value: want, inline: false },
                            { name: '👤 Trader', value: `<@${interaction.user.id}>`, inline: false }
                        )
                        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
                        .setTimestamp();

                    if (imageUrl && isValidUrl(imageUrl)) {
                        announceEmbed.setImage(imageUrl);
                    }

                    const itemIndex = data.trade_offering.length - 1;
                    const offerButton = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`make_offer_${itemIndex}`)
                                .setLabel('Make an Offer')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('🤝')
                        );

                    await announcementChannel.send({ embeds: [announceEmbed], components: [offerButton] });
                } catch (error) {
                    console.error('Error posting announcement:', error);
                }
            }
        }
    }
});

const token = process.env.YOUR_BOT_TOKEN;

if (!token) {
    console.error('❌ Error: Bot token not found!');
    console.error('Make sure you have added YOUR_BOT_TOKEN to Replit Secrets');
    process.exit(1);
}

client.login(token);