const {
    Telegraf,
    Markup,
    Extra
} = require('telegraf');
const { google } = require('googleapis');
const express = require('express');
const cors = require('cors');
const { places } = require('../client/src/helpers/placeEnum');
const { roles } = require('./helpers/roles');
const {
    token,
    webAppUrl,
    stuffChat
} = require('./helpers/variables');

const app = express();


app.use(express.json());
app.use(cors());

let chatId;





async function getListOfMatches() {
    const spreadsheetId = '1U3qU2GipkY0QsrTwVcSaviMC_hojuVre1r8m6EhQ6q8';
    const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: 'https://www.googleapis.com/auth/spreadsheets'
    });
    const client = await auth.getClient();
    const googleSheets = google.sheets({version: 'v4', auth: client})
    const matches = await googleSheets.spreadsheets.values.get({
        auth,
        spreadsheetId,
        range: 'Лист1' // replace
    });


    const listOfMatches = matches.data.values.map((item, index) => {
        return {
            id: index,
            parsedDate: parseDate(item[0], item[1]),
            buttonText: `${item[0]} ${item[1]} ${item[2]}-${item[3]}`,
            homeTeam: item[2],
            awayTeam: item[3],
            topMatch: !!item[4],
            date: item[0],
            time: item[1]
        }
    });

    function parseDate(date, time) {
        const dateArray = date.split('.');
        const formattedDate = `${dateArray[2]}.${dateArray[1]}.${dateArray[0]} ${time}`;

        return new Date(formattedDate);
    }

    function sortListOfMatches(list) {
        const now = Date.now();
        const filteredListOfMatches = list.filter(date => {

            return date.parsedDate && new Date(date.parsedDate).getTime() > now;
        });

        return filteredListOfMatches.sort((a, b) => a - b).slice(0, 2);
    }

    return sortListOfMatches(listOfMatches);
}





const bot = new Telegraf(token);
const basicMarkup = {
    reply_markup: {
        inline_keyboard: [
            [{text: 'Резерв столика', callback_data: 'reserve'}],
            [{text: 'Моя знижка', callback_data: '/'}],
            [{text: 'Передзамовлення', url: 'telegraf.js.org'}]
        ]
    }
}

bot.launch((context) => {
    chatId = context.chat.id;
    basicReply(context);
});

function basicReply(context, helloMsg = 'Вітаю в боті пабу Кутовий! Чим я можу допомогти?') {
    return context.reply(helloMsg, basicMarkup);
}


bot.on('message', async (context) => {
    chatId = context.chat.id;
    // chatId = context.chat.id;
    // console.log(bot.answerInlineQuery)
    // console.log(bot.answerInlineQuery())

    // console.log('on message', context, context?.web_app_data?.data)

    if(context.message.text === '/start') {
        basicReply(context);
    }

    if(context.message.text === '/check') {

        await context.sendMessage('checktest')
    }

    if(context?.web_app_data?.data) {
        try {
            const data = JSON.parse(context?.web_app_data?.data);
            await bot.sendMessage('Дякую. Очікується підтвердження броні від менеджера');
            await bot.sendMessage(data);

            setTimeout(async () => {
                await bot.sendMessage(chatId, 'Підтвердження наідйде сюди');
            }, 3000);
        } catch (e) {
            console.log(e);
        }
    } else {
        basicReply(context);
    }
})


// bot.on('text', (context) => {
//     basicReply(context, 'Вибачте, я Вас не розумію. Оберіть із наведеного нижче');
// })

bot.action('reserve', async (context) => {
    let list = await getListOfMatches();
    let reserveId;
    list.map(item => {
        return {
            text: item.buttonText,
            callback_data: 'matchdayReserve'
        }

    });

    function getUrlWithParams(obj) {
        const getParams = {
            parsedDate: obj.parsedDate,
            matchName: obj.matchName,
            title: obj.title,
            time: obj.time,
            date: obj.date,
            homeTeam: obj.homeTeam,
            awayTeam: obj.awayTeam,
        }

        const getParamsString = Object.keys(getParams).map(key => `${key}=${encodeURIComponent(getParams[key])}`).join('&');

        return {url: `${webAppUrl}/matchday?${getParamsString}`};
    }


    // return Extra.url(`${webAppUrl}/1`, {
    //     matchName: obj?.buttonText,
    //     topMatch: obj?.topMatch
    // })

    context.reply('Оберіть дату та час для бронювання',
        {
            reply_markup: {
                inline_keyboard: [
                    // [{text: list[0]?.buttonText || 'oops', web_app: {url: webAppUrl}}],
                    [{text: list[0]?.buttonText || 'oops', web_app: getUrlWithParams(list[0])}],
                    [{text: list[1]?.buttonText || 'oops', web_app: getUrlWithParams(list[1])}],
                    // [{text: list[1]?.buttonText || 'oops',  web_app: {url: webAppUrl}}],
                    [{text: 'Інший час', web_app: {url: `${webAppUrl}/notMatchday`}}]
                ]
            }
        }
    );

    app.post('/reserve', async (request, response) => {
        console.log(request.body)

        const username = context.update.callback_query.from.username;
        const {queryId, name, time, guests, place, date} = request.body;
        reserveId = Math.floor(Math.random() * (1000 - 1 + 1) + 1);
        const placeString = places.find(item => item.value === place).titleUa.toLocaleLowerCase();

        const groupChatMsg = `
Прийшла бронь #${reserveId} на ім'я ${name}
Кількість гостей: ${guests}
Дата: ${date} о ${time}
Побажання по розміщенню: ${placeString}
Контакт: @${username}
        `
        const msgMarkup = {
            reply_markup: {
                inline_keyboard: [
                    [{text: 'Підтвердити', callback_data: 'aproveReserve'}],
                    [{text: 'Скасувати', callback_data: 'disproveResreve'}],
                ]
            }
        }

        try {
            await bot.telegram.sendMessage(chatId, 'Очікується підтвердження бронювання від менеджера');
            await bot.telegram.sendMessage(stuffChat, groupChatMsg, msgMarkup)

            return response.status(200).json({'done': 'true'});
        } catch (e) {
             console.log(e)
            await context.reply('Не вдалось забронювати');

            return response.status(500).json({});
        }

    })
    // stuff

    bot.action('aproveReserve', async (context) => {
        // console.log(context.update.callback_query.from)
        if(roles.pubAdmins.includes(context.update.callback_query.from.id)) {
            await bot.telegram.sendMessage(chatId, `Бронь #${reserveId} підтверджена`)
            await bot.telegram.sendMessage(stuffChat, `Бронь #${reserveId} підтверджена`)
        } else {
            await bot.telegram.sendMessage(stuffChat, `Підтвердити бронь може тільки адміністратор`)
        }
        // console.log(context.update.callback_query.from)
        console.log('on aprove')
        // await bot.telegram.sendMessage(952151866, `Бронь #${reserveId} підтверджена `)

    });

    bot.action('disproveResreve', async (context) => {
        console.log('on disprove')
        // await bot.telegram.sendMessage(952151866, `Бронь #${reserveId} скасована`)
        await bot.telegram.sendMessage(chatId, `Бронь #${reserveId} скасована`)
        await bot.telegram.sendMessage(stuffChat, `Бронь #${reserveId} скасована`)
    })
})


bot.on('/check',)
bot.on('/check', async (context) => {
})


const PORT = 8000;

console.log('started')
app.listen(PORT, () => console.log('server started on PORT ' + PORT))
