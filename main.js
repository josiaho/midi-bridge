var port = '3030';

// Modules
var fs = require('fs');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var osascript = require('node-osascript');
var Atem = require('atem');
var myAtemDevice;
var midi = require('midi');
var input = new midi.input();
var socket = false;
var midiPort = null;
var db = {
	'id': 3,
	'atemIP': '192.168.1.240',
	'triggers': {
		1: {
			'm':'', // Midi Note
			'a': [2] // Actions to Trigger
		}
	},
	'actions': {
		2: {
			't': 1, // 1:Play Spotify, 2: Pause Spotify, 3: Play iTunes, 4: Pause iTunes, 5: Cut to ATEM
			'd': 0, // Duration (seconds) for Spotify/iTunes Fade
			'a': 0 // ATEM sourceID
		}
	}
};

// START SERVER
http.listen(port, '0.0.0.0', function(){console.log('Midi Bridge running on http://localhost:'+port);});

fs.readFile('db.db', 'utf8', function (err, data) {
	if (data == ''){
		fs.writeFile('db.db', JSON.stringify(db));
	} else {
		db = JSON.parse(data);
	}
	setAtemIP();
	setMidi();
});

function go(id) {
	var a = db.triggers[id].a;
	for (var i = 0; i < a.length; i++) {
		var fade = parseInt(db.actions[a[i]].d) / 100,
			cam = parseInt(db.actions[a[i]].a),
			t = parseInt(db.actions[a[i]].t);
		if (t == 1){
			spotifyIn(fade);
		} else if (t == 2) {
			spotifyOut(fade);
		} else if (t == 3) {
			iTunesIn(fade);
		} else if (t == 4) {
			iTunesOut(fade);
		} else if (t == 5) {
			myAtemDevice.setProgram(cam);
		}
	}
}

//----------------- SOCKET.IO ------------------
io.on('connection', function(socke){
	socket = socke;
	socket.emit('hi');
	// SAVE DB
	socket.on('save', function (data) {
		fs.writeFile('db.db', data);
		var tmp = JSON.parse(data);
		if (db.atemIP !== tmp.atemIP){
			setAtemIP();
		}
		db = tmp;
	});
	
	socket.on('go', function (id) {
		go(id);
		console.log('"'+db.triggers[id].t+'" Triggered via GUI');
	});
	
	socket.on('getMidiDevices', function () {
		var x = [], c = input.getPortCount();
		for (var i = 0; i < c.length; i++) {
			x.push(input.getPortName(i));
		}
		socket.emit('midiDevices', x);
	});
	
});



//------------------ EXPRESS -------------------
app.use(express.static(__dirname, '/'));
app.get('/', function(req, res){
	res.sendFile(__dirname + '/index.html');
});
app.get('/load', function(req, res){
	fs.readFile('db.db', 'utf8', function (err, data) {
		if (data == ''){
			data = JSON.stringify(db);
		}
		res.send(data);
	});
});



//-------------------- MIDI --------------------
function setMidi() {
	if (input.getPortCount() > 0){
		midiPort = input.getPortName(0);
		input = new midi.input()
		input.openPort(0);
		input.on('message', function(d, msg) {
			for (var t in db.triggers) {
				if (db.triggers[t].m == msg){
					go(t);
					console.log('"'+db.triggers[t].t+'" Triggered via Midi');
				}
			}
			if (socket){
				socket.emit('midiNote', msg);
			}
			console.log('Midi Received: '+msg);
		});
	}
}
function midiPoll() {
	var look = setInterval(function () {
		if (input.getPortCount() > 0){
			if (midiPort !== input.getPortName(0)){
				setMidi();
				console.log('Midi device found: '+input.getPortName(0));
			}
		} else {
			if (midiPort !== null){
				midiPort = null;
				input.closePort();
				console.log('Midi device lost - Looking...');
			}
		}
	}, 2000);
	if (input.getPortCount() > 0) {
		console.log('Midi device found: '+input.getPortName(0));
	} else {
		console.log('No Midi devices found - Looking...');
	}
}
midiPoll();



//-------------------- ATEM --------------------
function setAtemIP() {
	var ip = (db.atemIP)? db.atemIP : '192.168.1.240';
	myAtemDevice = new Atem(ip);
}
setAtemIP();



//---------------- APPLESCRIPT -----------------
function spotifyIn(fade) {
	osascript.execute('tell application "Spotify"\nif player state is paused then\nset volumespotify to the sound volume\nset volumespotify to 0\nplay\nrepeat\nrepeat with i from volumespotify to 100 by 1\nset the sound volume to i\ndelay '+fade+'\nend repeat\nexit repeat\nend repeat\nend if\nend tell');
}
function spotifyOut(fade) {
	osascript.execute('tell application "Spotify"\nif player state is not paused then\nset volumespotify to the sound volume\nrepeat\nrepeat with i from volumespotify to 0 by -1\nset the sound volume to i\ndelay '+fade+'\nend repeat\npause\nexit repeat\nend repeat\nend if\nend tell');
}
function iTunesIn(fade) {
	osascript.execute('tell application "iTunes"\nif player state is paused then\nset snd to the sound volume\nset snd to 0\nplay\nrepeat\nrepeat with i from snd to 100 by 1\nset the sound volume to i\ndelay '+fade+'\nend repeat\nexit repeat\nend repeat\nend if\nend tell');
}
function iTunesOut(fade) {
	osascript.execute('tell application "iTunes"\nif player state is not paused then\nset snd to the sound volume\nrepeat\nrepeat with i from snd to 0 by -1\nset the sound volume to i\ndelay '+fade+'\nend repeat\npause\nexit repeat\nend repeat\nend if\nend tell');
}