const Discord = require("discord.js")
const https = require("https")
const rl = require("readline")
const childprocess = require("child_process")
const shlex = require("shlex.js")
const fs = require("fs")
const perf = require("perf_hooks")
const boban = new Discord.Client()

boban.version = "v12 07.11.2018"

var starttime = Date.now()

var commrecord = {}

var settings = {
	restartonerror: false,
	apikey: "",
	logging: true,
	admins: {},
	ignorechannels: {},
	guildsettings: {}
}

var loggedas

const typeconv = {
	"string":{
		"tfunc":function(val){
			return val
		},
		"tname":"текст"
	},
	"bool":{
		"tfunc":function(val){
			val = String(val).toLowerCase()
			if(val == "true" | val == "да" | val == "1"){
				return true
			}
			else{
				return false
			}
		},
		"tname":"булеан"
	},
	"int":{
		"tfunc":function(val){
			val = parseInt(val)
			if(isNaN(val)){
				return undefined
			}
			return val
		},
		"tname":"целое число"
	},
	"float":{
		"tfunc":function(val){
			val = parseFloat(val)
			if(isNaN(val)){
				return undefined
			}
			return val
		},
		"tname":"число"
	},
	"client":{
		"tfunc":function(val){
			if(!(val = val.match(/<@!?(\d+)>/))) return undefined
			if(!val[1]) return undefined

			if(!(val = FindUser(val[1]))) return undefined

			return val
		},
		"tname":"упоминание пользователя"
	}
}

const permlevels = [
	{
		"desc":"все, кто захочет",
		"func": () => {return true}
	},
	{
		"desc":"админы бота и консоль",
		"func": (sender) => {return IsAdmin(sender)}
	},
	{
		"desc":"только консоль",
		"func": (sender) => {return sender == "CONSOLE"}
	},
	{
		"desc":"[ДАННЫЕ УДАЛЕНЫ]",
		"func": (sender) => {return Math.round(Math.random()*5) == 0}
	}
]

Boolean.prototype.toString = function(){
	return this == true ? "√" : "X"
}

Object.defineProperty(Array.prototype,'randomElement',{
	value: function(){
		return this[Math.floor(Math.random()*this.length)]
	}
})

Math.clamp = function(val,min,max){
	return Math.max(min,Math.min(max,val))
}

async function Logout(){
	await boban.destroy()
	loggedas = null

	return
}

async function Login(key = settings.apikey){
	if(!key){
		throw "API-ключ не указан. Укажите API-ключ в файле настроек"
	}

	try{
		loggedas = await boban.login(key)
	}
	catch(err){
		throw err
	}
}

function IsAdmin(id){
	return settings.admins[id] || id == "CONSOLE" && "CONSOLE" || false
}

function SafeJSON(str){
	try{
		return JSON.parse(str)
	}
	catch(err){
		return false
	}
}

function RandNumber(min, max,int) {
	var rand = min+Math.random()*(max-min)
	if(int){
		rand = Math.floor(rand)
	}
	return rand
}

// Пример использования функции форматирования времени:
// FormatTime(72457462587,[["days",86400000],["hours",3600000],["minutes",60000],["seconds",1000]])

function FormatTime(val,durar = [["лет",31536000000],["дней",86400000],["часов",3600000],["минут",60000],["секунд",1000]]){
	val = Math.abs(Number(val))
	var out = []

	for(k in durar){

		dur = durar[k]

		var name = dur[0]
		var len = dur[1]

		if(val < len & (k < durar.length-1 | out.length > 0)) continue

		out.push(Math.floor(val/len))
		out.push(name)

		val = val%len
	}

	return out.join(" ")
}

function GetTimeRunning(){
	return Date.now()-starttime
}

function GetCommandInfo(name){
	var comm = commands[name]
	if(!comm){return "Команды '"+name+"' не существует."}

	var out = "<@"+boban.user.id+"> "+String(name)+"\n "+String(comm.help)+"\n Данную команду могут выполнить "+permlevels[comm.perm].desc+"\n Запись в историю: "+comm.record.toString()+"\n "+(comm.args.length == 0 ? "Аргументов нет." : "Аргументы:\n")
	
	for(var k in comm.args){
		v = comm.args[k]
		out=out+"  "+(typeconv[v.type] ? (typeconv[v.type]).tname : v.type)+(v.help ? " - "+v.help : "")+";"
	}

	return out+"\n"
}

function ListCommands(){
	var funclist = ""

	for(var key in commands){
		if(commands[key].secret === true) continue
		funclist = funclist+GetCommandInfo(key)+"\n"
	}

	return funclist
}

async function ExecCommand(comm,args,outmethod,message,sender){

	var commdata = commands[comm]

	if(!commdata){
		outmethod("Команды '"+comm+"' не существует. Выполни команду 'что-умеешь', чтобы ознакомиться со списком комманд.")
		return
	}

	if(permlevels[commdata.perm].func(sender) === false){
		outmethod("Вы не можете выполнить эту функцию. Данную функцию могут выполнить "+permlevels[commdata.perm].desc)
		return
	}

	//Получаем массив необходимых для функции аргументов
	var commargs = commdata.args
	
	for(commargid in commargs){
		commarg = commargs[commargid]

		//Ищем конвертер для аргумента (функция, которая делает аргумент строгим, тоесть если аргумент функции указан int, то в него сможет попасть только целое число)
		var typeconverter = typeconv[commarg.type]

		//Если тип не найдет то ошибос
		if(!typeconverter){
			outmethod("Ошибка в аргументе "+commargid+", тип '"+commarg.type+"' неизвестен.")
			return
		}

		//Парсим аргумент
		try{
			var convertedarg = await typeconverter.tfunc(args[commargid],message)
		}
		catch(err){
			outmethod("Ошибка при парсинге аргумента "+commargid+": "+err)
			return
		}

		//Если аргумент запарсить не удалось
		if(convertedarg === undefined){
			//Подставляем стандартное значение (ести есть)
			if(commarg.def != undefined){
				args[commargid] = commarg.def
			}
			//Если его нет то ошибос
			else{
				outmethod("Ошибка в аргументе "+commargid+": '"+args[commargid]+"' не является значением типа '"+typeconverter.tname+"' ("+commarg.help+")\nДля получения информации о команде выполни 'помощь "+comm+"'")
				return
			}
		}
		else{
			args[commargid] = convertedarg
		}
	}

	console.log(sender+" выполнил функцию '"+comm+"' <- '"+args.join(" ")+"'")

	//После того как все аргументы запарсены, записываем её в историю данного пользователя.

	if(commdata.record)
		commrecord[sender] = {
			"comm": comm,
			"args": args
		}

	//После того как все аргументы запарсены, выполняем функцию.

	try{
		commdata.func(args,outmethod,message,sender)
	}
	catch(err){
		outmethod("Ошибка при выполнении функции: "+err)
	}
}

function WriteSetts(){
	let promise = new Promise(function(resolve,reject){
		fs.writeFile("settings.txt",JSON.stringify(settings),{},function(err){
			if(err){
				reject(err)
			}

			resolve()
		})
	})

	return promise
}

/* Коды выполнения функции

	resolve
	0 - Настройки успешно прочитаны
	1 - Файл настроек был перезаписан на дефольные настройки (потому что файл настроек неправильно оформлен или отсутствует.)

	reject
	Возвращает ошибку.
*/

function ReadSetts(){
	let promise = new Promise(function(resolve,reject){

		var shouldrewrite = false

		fs.readFile("settings.txt","utf-8",function(err,data){

			if(err){
				if(err.code == "ENOENT"){
					shouldrewrite = true
				}
				else{
					reject(err)

					return
				}
			}
			else{

				setts = SafeJSON(data)
			
				if(!setts) shouldrewrite = true
			}
			
			if(shouldrewrite){
				WriteSetts().then(function(){
					resolve(1)
				},function(err){
					reject(err)
				})
			
				return
			}
			
			Object.assign(settings,setts)
			
			resolve(0)
		})
	})

	return promise
}

async function Shutdown(message,restart){
	if(message) console.log(message)

	await Logout()

	if(restart){
		let proc = childprocess.spawn(process.argv[0],process.argv.splice(1),{
			"detached": true,
			"shell": true
		})
	}
	process.exit(0)
}

function InterpCommand(mes,checkprefix){
	var args = shlex.split(mes)
	var ment = String(args[0]).match(/<@!?([\d]+)>/)
	
	if(checkprefix)
		if(ment && ment[1] == boban.user.id) args.splice(0,1)
		else return

	var comm = args.splice(0,1).toString()

	return {
		"comm":comm,
		"args":args
	}

}

function FindUser(id,checkguild){
	var guilds = checkguild ? [checkguild] : boban.guilds.array()

	for(guild in guilds){
		guild = guilds[guild]
		var user = guild.members.find("id",id)

		if(user) return user
	}
}

async function Say(text,mesoptions,target,message){
	mesoptions = Object.assign({split:{char:' '}},mesoptions || {})

	if(target instanceof Discord.TextChannel) return target.send(text,mesoptions)
	else if(target instanceof Discord.User) return target.send(text,mesoptions)
	else if(message) return message.reply(text,mesoptions)
	else{
		console.log(text); return Promise.resolve()
	}
}

const commands = {
	"привет":{
		"record":false,
		"help":"Поздороваюсь.",
		"args":[],
		"perm":0,
		"func":function(args,outmethod){
			outmethod(["здрастикс","ёу","чос","эу","пребет","здорова"].randomElement())
		}
	},
	"что-умеешь":{
		"record":true,
		"help":"Список команд бобана.",
		"args":[],
		"perm":0,
		"func":function(args,outmethod,message,sender){
			if(sender != "CONSOLE" && message.channel.type != "dm") outmethod("Список комманд был отправлен вам в ЛС.")
			outmethod("Список доступных комманд:\n"+ListCommands(),{split:{char:"\n"}},sender == "CONSOLE" ? undefined : message.author)
		}
	},
	"помощь":{
		"record":true,
		"help":"Высветит информацию о команде.",
		"args":[{"type":"string","help":"команда"}],
		"perm":0,
		"func":function(args,outmethod){
			outmethod(GetCommandInfo(args[0]))
		}
	},
	"я-лох":{
		"record":true,
		"help":"Пояснит по - братски, являетесь ли вы лохом.",
		"args":[],
		"perm":0,
		"func":function(args,outmethod,message,sender){
			if(sender == "CONSOLE"){outmethod("Комманда не выполнима из консоли"); return}
			if(parseInt(message.author.client.id)%2 == 0){
				message.reply("Да")
			}
			else{
				message.reply("Нет")
			}
		}
	},
	"покажи-видео":{
		"record":true,
		"help":"Отыщет случайное видео с YouTube.",
		"args":[{"type":"string","def":"","help":"поисковой запрос"}],
		"perm":0,
		"func":function(args,outmethod){

			var randdate = new Date(RandNumber(Date.now(),1116795600000)).toISOString()

			var req = https.get({
				host:"www.googleapis.com",
				port:443,
				path:"/youtube/v3/search?key=AIzaSyA4nDpWlQ7P3jH9E9RYwwKKfFgXfXPKA3o&part=snippet&type=video&maxResults=50&order=date&publishedBefore="+randdate,
				method:"GET",
			},function(resp){
				
				bodyChunks = []
				resp.on('data', function(chunk) {
					bodyChunks.push(chunk)
				}).on('end', function() {


					var resp = SafeJSON(Buffer.concat(bodyChunks))
					
					if(!resp){outmethod("Ошибка: ответ от API не распознан"); return}

					if(resp.error){outmethod("Ошибка от API: "+resp.error.code+" - "+resp.error.message); return}
					
					if(resp.items.length == 0){outmethod("Похоже, на ютубе нет никаких видео (?)."); return}
					
					var randvid = (resp.items.randomElement()).id.videoId
					
					outmethod("https://www.youtube.com/watch?v="+randvid)
				}).on('error', function(err){
					outmethod("Ошибка подключения к YouTube API: "+err)
				})
			})
		}
	},
	"покажи-картинку":{
		"record":true,
		"help":"Отыщет случайную картинку с Imgur.",
		"args":[],
		"perm":0,
		"func":function(args,outmethod){

		}
	},
	"ещё":{
		"record":false,
		"help":"Выполнит команду, написанную вами в прошлый раз.",
		"args":[],
		"perm":0,
		"func":function(args,outmethod,message,sender){
			var record = commrecord[sender]
			if(record){
				ExecCommand(record["comm"],args.length > 0 ? args : record["args"],outmethod,message,sender)
			}
			else{
				outmethod("Вы не выполняли никаких комманд до этого.")
			}
		}
	},
	"ролл":{
		"record":true,
		"help":"Скажет случайное число.",
		"args":[{"type":"float","help":"первое число"},{"type":"float","help":"второе число"},{"type":"bool","help":"только целые числа"}],
		"perm":0,
		"func":function(args, outmethod, message){
			outmethod(RandNumber(args[0],args[1],args[2]))
		}
	},
	"инфо":{
		"record":true,
		"help":"Отобразит информацию о подключении бобана к Discord API и потреблении ресурсов хоста приложением.",
		"args":[],
		"perm":0,
		"func":function(args,outmethod){
			outmethod("Бобан "+boban.version+"\nПодключение:\n Пинг: "+boban.ping+"\nХост:\n Занято памяти: "+FormatTime(process.memoryUsage()["rss"],[["гигобайт",1073741824],["мегабайт",1048576],["килобайт",1024],["байт",1]])+"\n Время работы приложения: "+FormatTime(GetTimeRunning())+"\n Время работы хост-машины: "+FormatTime(perf.performance.now()))
		}
	},
	"перелогинься":{
		"record":true,
		"help":"Переподключает Бобана к Discord API.",
		"args":[],
		"perm":0,
		"func":function(args,outmethod){
			outmethod("Перелогиниваюсь...").then(function(){
				Login().then(function(){
					outmethod("Готово!")
				}).catch(function(err){
					outmethod("Не удалось перелогиниться: "+err)
				})
			})
		}
	},
	"дай-мемы":{
		"record":true,
		"help":"Бобан даст вам мемы",
		"args":[{"type":"int","def":5,"help":"количество"}],
		"perm":0,
		"func":function(args,outmethod){
			if(args[0] > 100){
				outmethod("ты что мне API по башке даст если я столько отправлю. давай какие-нибудь разумные числа там 1 или 2 в конец концов боже мой.")
				return
			}
			var allemojis = boban.emojis.array()
			var emojis = []

			for(var i = 0;i<args[0] && allemojis.length > 0;i++){
				emojis.push(allemojis.randomElement())
			}
			outmethod(emojis.length > 0 ? emojis.join(" ") : "Мемов нет.")
		}
	},
	"выполни":{
		"record":true,
		"help":"Выполнит JavaScript код",
		"args":[{"type":"string","help":"код"}],
		"perm":1,
		"func":function(args,outmethod,message){
			var result
			try{
				result = eval(args[0])
			}
			catch(err){
				outmethod("Ошибка при выполнении: "+err)
			}

			if(result) outmethod(result)
		}
	},
	"дай-админку":{
		"record":true,
		"help":"Даст админку бота игроку.",
		"args":[{"type":"string","help":"пользователь, которому дать админку"}],
		"perm":1,
		"func":function(args,outmethod){

		}
	},
	"забери-админку":{
		"record":true,
		"help":"Даст админку бота игроку.",
		"args":[{"type":"string","help":"пользователь, от которого забрать админку"}],
		"perm":1,
		"func":function(args,outmethod){

		}
	},
	"произнеси":{
		"record":true,
		"help":"Произнесёт фразу, используя text-to-speech.",
		"args":[{"type":"string","help":"текст, который нужно произнести"}],
		"perm":0,
		"func":function(args,outmethod){
			outmethod(args[0],{"tts":true})
		}
	},
	"закодируй":{
		"record":true,
		"help":"Закодирует сообщение с помощью смайликов",
		"args":[{"type":"string","help":"сообщение, которое надо закодировать"}],
		"perm":0,
		"func":function(args,outmethod){
			var emojis = boban.emojis

			
		}
	},
	"секретка":{
		"record":true,
		"secret":true,
		"help":"чтоето....",
		"args":[],
		"perm":0,
		"func":function(args,outmethod){
			outmethod("ты нашел секретку еху ура.")
		}
	},
	"себись":{
		"record": false,
		"secret": false,
		"help": "Выключить бобана",
		"args":[],
		"perm":1,
		"func":async function(args,outmethod){
			await outmethod("досвидулки")
			await Shutdown()
		}
	},
	"живи":{
		"record": true,
		"secret": true,
		"help": "...",
		"args":[],
		"perm":0,
		"func":function(args,outmethod){
			outmethod("ну живу и далше что")
		}
	}
}

boban.on('ready',() => {
	console.log("Залогинились!")
})

boban.on('resume',() => {
	console.log("Подключение восстановлено!")
})

boban.on('reconnecting',() => {
	console.log("Перелогиниваемся...")
})

boban.on('error',(err) => {
	console.log("Ошибка подключения:"+err)
})

boban.on('message', (message) => {

	if(message.author.id == boban.user.id) return

	var interp = InterpCommand(message.content,message.channel.type != "dm")

	if(!interp) return

	ExecCommand(interp.comm,interp.args,function(text,mesoptions,target){return Say(text,mesoptions,target,message)},message,message.author.id)
})

var con = rl.createInterface({
	"prompt": "",
	"input": process.stdin,
	"output": process.stdout
})

con.on('line',(input) => {
	var interp = InterpCommand(input,false)
	
	if(!interp) return

	ExecCommand(interp.comm,interp.args,function(text,mesoptions,target){return Say(text,mesoptions,target,undefined)},undefined,"CONSOLE")
})

console.log("▓▓▓▓▓▓▓▒▒▒▒▒▒▓▓▓▓▒▒▒▒▒▒▓▓▓\n▓▓▓▓▓▓▓▓▒▒▒▒▒▓▓▓▒▒▒▒▒▒▓▓▓▓\n▓▓▓▓▓▓▓▓▓▒▒▒▒▓▓▓▒▒▒▒▓▓▓▓▓▓\n▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓\n▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓▓\n▓▓▓▓▒▒▒▒░░░▒▒▒▒▒░░░▒▒▒▒▓▓▓\n▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓\n▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░▒▒▒▒▒▒▓\n▓▒▒▒▒▒▒▒░░░░░░░░░▒▒▒▒▒▒▒▒▒\n▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒\n▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓\n▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓\n▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓\nБобан "+boban.version)

console.log("Читаем настройки...")

ReadSetts().catch(function(err){
	console.log("Не удалось прочитать настройки, используем стандартные: "+err.message)
	return
}).then(function(){
	console.log("Логинимся...")
	Login().catch(function(err){console.log("Не удалось залогинится: "+err)})
})