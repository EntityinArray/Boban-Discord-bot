const Discord = require("discord.js")
const Crypto = require("crypto")
const https = require("https")
const readline = require("readline")
const childprocess = require("child_process")
const shlex = require("shlex.js")
const fs = require("fs")
const boban = new Discord.Client()
const gapis = require("googleapis")

boban.version = "v11 22.12.2017"

var commrecord = {}

var settings = {
	restartonerror: false,
	apikey: "",
	logging: true,
	admins: {}
}

var loggedas

const typeconv = {
	"string":{
		"tfunc":function(val){
			return String(val)
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
			if(typeof val == "number" && !val){
				return undefined
			}
			return val
		},
		"tname":"целое число"
	},
	"float":{
		"tfunc":function(val){
			val = parseFloat(val)
			if(typeof val == "number" && !val){
				return undefined
			}
			return val
		},
		"tname":"число"
	},
	"client":{
		"tfunc":function(val,sender){
			return (new Promise()).resolve(boban.fetchUser(val))

		},
		"tname":"id клиента"
	},
}

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

function Logout(){
	let promise = new Promise(function(resolve,reject){
		boban.destroy().then(function(){
			loggedas = null
			resolve()
		})
	})

	return promise
}

function Login(key = settings.apikey){
	let promise = new Promise(function(resolve,reject){

		if(!key) reject(Error("Не указан API-ключ для авторизации. Укажите его в файле настроек."))

		boban.login(key).then(function(token){
			loggedas = token
			resolve()
		},function(err){
			reject(err)
		})
	})

	return promise
}

function IsAdmin(id){
	if(settings.admins[id] | id == "CONSOLE"){return true}

	return false
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
	val = Number(val)
	var out = []

	for(k in durar){

		dur = durar[k]

		var name = dur[0]
		var len = dur[1]

		if(val < len & k < durar.length-1) continue

		out.push(Math.floor(val/len))
		out.push(name)

		val = val%len
	}

	return out.join(" ")
}

function GetCommandInfo(name){
	var comm = commands[name]
	if(!comm){return "Команды \""+name+"\" не существует."}

	var out = "Бобан "+String(name)+"\n "+String(comm.help)+"\n Админская: "+Boolean(comm.adminonly).toString()+"; Консольная: "+Boolean(comm.consoleonly).toString()+"; История: "+Boolean(comm.record).toString()+"\n "+(comm.args.length == 0 ? "Аргументов нет." : "Аргументы:\n")
	
	for(var k in comm.args){
		v = comm.args[k]
		out=out+"  "+(typeconv[v.type] ? (typeconv[v.type]).tname : v.type)+(v.help ? " - "+v.help : "")+";"
	}

	return out+"\n"
}

function ListCommands(page,perpage){
	var funclist = ""
	var keys = Object.keys(commands)

	page = page-1

	for(var i=(perpage ? page*perpage : 0);(i < page*perpage+perpage | !perpage) & i < keys.length;i++){
		funclist = funclist+GetCommandInfo(keys[i])
	}

	return funclist
}

async function ExecCommand(comm,args,outmethod,message,sender){

	var commdata = commands[comm]

	if(!commdata){
		outmethod("Команды "+comm+" не существует. Выполни команду 'что-умеешь', чтобы ознакомится со списком комманд.")
		throw
	}

	if(sender != "CONSOLE"){
		if(commdata.adminonly & !IsAdmin(sender)){
			outmethod("Для выполнения этой команды необходимо быть в списке администраторов бота.")
			throw
		}
		if(commdata.consoleonly){
			outmethod("Эта команда выполнима только из консоли.")
			throw
		}
	}

	//Получаем массив необходимых для функции аргументов
	var commargs = commdata.args
	
	for(commargid in commargs){
		commarg = commargs[commargid]

		//Ищем конвертер для аргумента (функция, которая делает аргумент строгим, тоесть если аргумент функции указан int, то в него сможет попасть только целое число)
		var typeconverter = typeconv[commarg.type]

		//Если тип не найдет то ошибос
		if(!typeconverter){
			outmethod("Ошибка в аргументе "+commargid+", тип \""+commarg.type+"\" неизвестен.")
			throw
		}

		//Парсим аргумент
		var convertedarg = await typeconverter.tfunc(args[commargid])

		//Если аргумент запарсить не удалось
		if(covertedarg === undefined){
			//Подставляем стандартное значение (ести есть)
			if(commarg.def){
				args[commargid] = commarg.def
			}
			//Если его нет то ошибос
			else{
				outmethod("Ошибка в аргументе "+commargid+", значением аргумента должно быть \""+commarg.type+"\" - "+typeconverter.tname)
				throw
			}
		}
		else{
			args[commargid] = convertedarg
		}
	}

	//После того как все аргументы запарсены, записываем её в историю данного пользователя.

	commrecord[sender] = {
		"comm": comm,
		"args": args
	}

	//После того как все аргументы запарсены, выполняем функцию.

	commdata.func(args,outmethod,message,sender)
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

			setts = SafeJSON(data)
			
			if(!setts) shouldrewrite = true
			
			if(shouldrewrite){
				WriteSetts().then(function(){
					resolve()
				},function(err){
					reject(err)
				})
			
				return
			}
			
			Object.assign(settings,setts)
			
			resolve()
		})
	})

	return promise
}

var con = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: ""
})

con.on("line",function(input){
	let comm = InterpCommand(input)

	if(!comm) return

	ExecCommand(comm.comm,comm.args,function(mes){console.log(mes); return new Promise(function(resolve){resolve()})},null,"CONSOLE")

	con.prompt()
})

function Shutdown(message,restart){
	if(message) console.log(message)

	let promise = new Promise(function(resolve,reject){
		Logout().then(function(){
			if(restart){
				let proc = async function(){
					return await childprocess.spawn("node",["."],{
						"detached" : true
					})
				}
	
				proc.stdout.on("line",function(){process.exit(0)})
			}
			else{
				process.exit(0)
			}
		})
	})
}

function InterpCommand(mes){
	var args = shlex.split(mes)
	var comm = args.splice(0,1).toString()

	return {
		"comm":comm,
		"args":args
	}

}

const commands = {
	"":{
		"record":false,
		"help":"Отзываюсь, когда некто в чате называет моё имя.",
		"args":[],
		"func":function(args,outmethod){
			outmethod(["м","я","чос","эу","дратути"].randomElement())
		}
	},
	"что-умеешь":{
		"record":true,
		"help":"Список команд бобана.",
		"args":[{"type":"int","def":1,"help":"номер страницы"}],
		"func":function(args,outmethod){
			var pageam = Math.ceil(Object.keys(commands).length/3)
			args[0] = Math.min(Math.max(1,args[0]),pageam)
			outmethod("Список доступных комманд:\n"+ListCommands(args[0],3)+"\nСтраница "+args[0]+"/"+pageam)
		}
	},
	"помощь":{
		"record":true,
		"help":"Высветит информацию о команде.",
		"args":[{"type":"string","help":"команда"}],
		"func":function(args,outmethod){
			outmethod(GetCommandInfo(args[0]))
		}
	},
	"я-лох":{
		"record":true,
		"help":"Пояснит по - братски, являетесь ли вы лохом.",
		"args":[],
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
				})
			})
		}
	},
	"уйди":{
		"adminonly":true,
		"record":false,
		"help":"Выключает Бобана.",
		"args":[],
		"func":function(args,outmethod,message,sender){
			outmethod("Пока.").then(function(){Shutdown()})
		}
	},
	"ещё":{
		"record":false,
		"help":"Выполнит команду, написанную вами в прошлый раз.",
		"args":[],
		"func":function(args,outmethod,message,sender){
			var record = commrecord[sender]
			if(record){
				ExecCommand(record["comm"],record["args"],outmethod,message,sender)
			}
			else{
				outmethod("Вы не выполняли никаких комманд до этого.")
			}
		}
	},
	"рестарт":{
		"adminonly":true,
		"record":false,
		"help":"Перезапуск Бобана.",
		"args":[],
		"func":function(args,outmethod){
			Shutdown(null,true)
		}
	},
	"ролл":{
		"record":true,
		"help":"Скажет случайное число.",
		"args":[{"type":"float","help":"первое число"},{"type":"float","help":"второе число"},{"type":"bool","help":"только целые числа"}],
		"func":function(args, outmethod, message){
			outmethod(RandNumber(args[0],args[1],args[2]))
		}
	},
	"инфо":{
		"record":true,
		"help":"Отобразит информацию о подключении бобана к Discord API и потреблении ресурсов хоста приложением.",
		"args":[],
		"func":function(args,outmethod){
			outmethod("Бобан "+boban.version+"\nПодключение:\n Пинг: "+boban.ping+"\nХост:\n Потребление CPU: "+process.cpuUsage()["system"]+"\n Занято памяти: "+process.memoryUsage()["rss"]+"\n Бобан работает на протяжении ")
		}
	},
	"перелогинся":{
		"record":true,
		"help":"Переподключит бобана к Discord API",
		"args":[],
		"func":function(args,outmethod){
			Login()
		}
	}
}

boban.on('ready',() => {
	console.log("Залогинились!")
})

boban.on('message', (message) => {

	if(message.author.id != boban.user.id && (listenchannels[message.channel.id] || Object.keys(listenchannels).length == 0)){

		if(!message.mentions().users.find("id",boban.user.id) & !(message.channel instanceof DMChannel)) return

		var interp = InterpCommand(message.content)

		if(!interp) return

		ExecCommand(interp["comm"],interp["args"],function(mes){return message.reply(mes)},message,message.author.id)
	}
})

console.log("▓▓▓▓▓▓▓▒▒▒▒▒▒▓▓▓▓▒▒▒▒▒▒▓▓▓\n▓▓▓▓▓▓▓▓▒▒▒▒▒▓▓▓▒▒▒▒▒▒▓▓▓▓\n▓▓▓▓▓▓▓▓▓▒▒▒▒▓▓▓▒▒▒▒▓▓▓▓▓▓\n▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓\n▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓▓▓\n▓▓▓▓▒▒▒▒░░░▒▒▒▒▒░░░▒▒▒▒▓▓▓\n▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓\n▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░▒▒▒▒▒▒▓\n▓▒▒▒▒▒▒▒░░░░░░░░░▒▒▒▒▒▒▒▒▒\n▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒\n▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓\n▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▓\n▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓\nБобан "+boban.version)

console.log("Читаем настройки...")

ReadSetts().catch(function(err){
	console.log("Не удалось прочитать настройки, используем стандартные: "+err.message)
	return
}).then(function(){
	console.log("Логинимся...")
	Login().catch(function(err){Shutdown("Не удалось залогинится: "+err.message)})
})
