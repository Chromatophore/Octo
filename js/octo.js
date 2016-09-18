"use strict";

////////////////////////////////////
//
//   Prettyprinting
//
////////////////////////////////////

var zeroes = "00000000";

function maskFormat(mask) {
	if (emulator.maskFormatOverride) { return binaryFormat(mask);  }
	else                             { return numericFormat(mask); }
}

function numericFormat(num, format) {
	if (!format)
		format = emulator.numericFormatStr;

	if (format == "dec")      { return decimalFormat(num); }
	else if (format == "bin") { return binaryFormat(num);  }
	else if (format == "hex") { return hexFormat(num);     }

	return hexFormat(num);
}


function decimalFormat(num) {
	var dec = num.toString(10);
	return dec;
}

//function hexFormat(num, pad = 2, preslice = false) { // Edge doesn't support this?
function hexFormat(num, pad, preslice) {
	if (pad == undefined) { pad = 2; }
	if (preslice == undefined) { preslice = false; }
	var hex  = num.toString(16).toUpperCase();
	var pad0 = zeroPad(hex.length, pad);
	if (preslice)
		return pad0 + hex;
	else
		return "0x" + pad0 + hex;
}

function binaryFormat(num) {
	var bin  = num.toString(2);
	var pad0 = zeroPad(bin.length, 8);
	return "0b" + pad0 + bin;
}

function zeroPad(strLen, byteLength) {
	var dif = strLen % byteLength;
	if (dif == 0) { return ""; }

	var len  = byteLength - dif;
	var pad0 = zeroes.substr(0, len);
	return pad0;
}


function display(rom) {
	return "[" + (rom.map(function(x) { return hexFormat(x); }).join(", ")) + "]";
}

////////////////////////////////////
//
//   Emulator Setup
//
////////////////////////////////////

var intervalHandle = null;
var emulator = new Emulator();

function run() {
	runRom(compile());
}

function compile() {
	var input  = document.getElementById("input");
	var output = document.getElementById("output");
	var status = document.getElementById("status");

	var MAX_ROM = 3584;
	if (emulator.enableXO) { MAX_ROM = 65536 - 512; }

	var c = new Compiler(input.value);
	try {
		output.value = "";
		output.style.display = "none";
		c.go();
		if (c.xo && (!emulator.enableXO)) {
			throw "Rom makes use of XO-Chip extensions. They must be enabled in the Options panel.";
		}
		if (c.rom.length > MAX_ROM) {
			throw "Rom is too large- " + (c.rom.length-MAX_ROM) + " bytes over!";
		}
		output.value = display(c.rom);
		output.style.display = "inline";
		status.innerHTML = ((c.rom.length) + " bytes, " + (MAX_ROM-c.rom.length) + " free.");
		status.style.backgroundColor = "black";
		if (c.schip) { status.innerHTML += " (SuperChip instructions used)"; }
		if (c.xo) { status.innerHTML += " (XO-Chip instructions used)"; }
	}
	catch(error) {
		status.style.backgroundColor = "darkred";
		status.innerHTML = error;
		if (c.pos != null) {
			input.focus();
			input.selectionStart = c.pos[1]-1;
			input.selectionEnd   = c.pos[2]-1;
		}
		return null;
	}

	return {
		rom        :c.rom,
		breakpoints:c.breakpoints,
		dbginfo	   :c.dbginfo,
		aliases    :c.aliases,
		labels     :c.dict
	};
}

function runRom(rom) {
	if (rom === null) { return; }
	if (intervalHandle != null) { reset(); }
	emulator.exitVector = reset;
	emulator.importFlags = function() { return JSON.parse(localStorage.getItem("octoFlagRegisters")); }
	emulator.exportFlags = function(flags) { localStorage.setItem("octoFlagRegisters", JSON.stringify(flags)); }
	emulator.buzzTrigger = function(ticks, remainingTicks) { playPattern(ticks, emulator.pattern, remainingTicks); }
	emulator.init(rom);
	audioSetup();
	document.getElementById("emulator").style.display = "inline";
	document.getElementById("emulator").style.backgroundColor = emulator.quietColor;
	window.addEventListener("keydown", keyDown, false);
	window.addEventListener("keyup"  , keyUp  , false);
	intervalHandle = setInterval(render, 1000/60);
}

function reset() {
	document.getElementById("emulator").style.display = "none";
	window.removeEventListener("keydown", keyDown, false);
	window.removeEventListener("keyup"  , keyUp  , false);
	window.clearInterval(intervalHandle);
	clearBreakpoint();
	stopAudio();
	document.getElementById("exRegisterView").style.display = "none"
	document.getElementById("txtM0").innerText = "-1";
	document.getElementById("txtM1").innerText = "-1";
	document.getElementById("memorybox").innerHTML = "";
}

function share() {
	// cribbed from increpare/Puzzlescript/js/toolbar.js
	var xhr = new XMLHttpRequest();
	xhr.open('POST', 'https://api.github.com/gists');
	xhr.onreadystatechange = function() {
		if (xhr.readyState !== 4) { return; }
		var result = JSON.parse(xhr.responseText);
		if (xhr.status === 403) {
			alert(result.message);
		}
		else if (xhr.status !== 200 && xhr.status !== 201) {
			alert("HTTP Error "+ xhr.status + ' - ' + xhr.statusText);
		}
		else {
			window.location.href = window.location.href.replace(/(index.html|\?gist=.*)*$/, 'index.html?gist=' + result.id);
		}
	}
	var prog = document.getElementById("input").value;
	var options = JSON.stringify({
		"tickrate"        : emulator.tickrate,
		"fillColor"       : emulator.fillColor,
		"fillColor2"      : emulator.fillColor2,
		"blendColor"      : emulator.blendColor,
		"backgroundColor" : emulator.backgroundColor,
		"buzzColor"       : emulator.buzzColor,
		"quietColor"      : emulator.quietColor,
		"shiftQuirks"     : emulator.shiftQuirks,
		"loadStoreQuirks" : emulator.loadStoreQuirks,
		"vfOrderQuirks"   : emulator.vfOrderQuirks,
		"clipQuirks"      : emulator.clipQuirks,
		"jumpQuirks"      : emulator.jumpQuirks,
		"enableXO"        : emulator.enableXO,
	});
	xhr.send(JSON.stringify({
		"description" : "Octo Chip8 Program",
		"public" : true,
		"files": {
			"readme.txt" : {
				"content": "Play this game by pasting the program into http://johnearnest.github.io/Octo/"
			},
			"prog.ch8" : { "content": prog },
			"options.json": { "content": options }
		}
	}));
}

function runGist() {
	var xhr = new XMLHttpRequest();
	var gistId = location.search.match(/gist=(\w+)/);
	if (!gistId) { return; }
	xhr.open('GET', 'https://api.github.com/gists/' + gistId[1]);
	xhr.onreadystatechange = function() {
		if (xhr.readyState == 4 && (xhr.status == 200 || xhr.status !== 201)) {
			var result = JSON.parse(xhr.responseText);
			document.getElementById("input").value = result.files["prog.ch8"].content;
			var options = JSON.parse(result.files["options.json"].content);
			var framerateNum = options["tickrate"]|0;
			var framerateEl = document.getElementById("framerate");
			framerateEl.value = framerateNum;
			emulator.tickrate = (framerateEl.value == "") ? framerateNum : framerateEl.value;
			unpackOptions(emulator, options);
			if (emulator.enableXO) {
				document.getElementById("enableXO").checked = true;
				setEnableXO();
			}
			run();
		}
	}
	xhr.send();
}

////////////////////////////////////
//
//   Emulator Execution
//
////////////////////////////////////

function render() {
	for(var z = 0; (z < emulator.tickrate) && (!emulator.waiting); z++) {
		if (emulator.breakpoint != true) {
			emulator.tick();
			if (emulator.pc in emulator.metadata.breakpoints) {
				haltBreakpoint(emulator.metadata.breakpoints[emulator.pc]);
			}
		}
	}
	if (emulator.breakpoint != true) {
		if (emulator.dt > 0) { emulator.dt--; }
		if (emulator.st > 0) { emulator.st--; }
	}
	renderDisplay(emulator);
	if (emulator.halted) { return; }
	document.getElementById("emulator").style.backgroundColor = (emulator.st > 0) ? emulator.buzzColor : emulator.quietColor;
}

function keyDown(event) {
	if (!(event.keyCode in emulator.keys)) {
		emulator.keys[event.keyCode] = true;
		if (event.keyCode in keymapInverse) {
			// add an "active" class to the current button
			var keyElement = document.getElementById(
				'0x' + keymapInverse[event.keyCode].toString(16).toUpperCase()
			);
			if (!(keyElement.className.match(/active/))) {
				keyElement.className += ' active';
			}
		}
		if (event.keyCode == 76) // l
		{
			var tid = setInterval(function(){
				if (emulator.keys[76])
				{
					if (emulator.breakpoint) {
						if (emulator.waiting == false) // if the emulator is waiting for key input, do not tick
							emulator.tick();

						renderDisplay(emulator);

						// display an appropriate message based on situation:
						var breaksting = emulator.waiting ? "waiting for input" : "single stepping";
						haltBreakpoint(breaksting);
					} else {
						clearInterval(tid);
					}
				} else {
					clearInterval(tid);
				}
			}, 100);
		}
	}
}

function keyUp(event) {
	if (event.keyCode in emulator.keys) {
		delete emulator.keys[event.keyCode];
		if (event.keyCode in keymapInverse) {
			var keyElement = document.getElementById(
				'0x' + keymapInverse[event.keyCode].toString(16).toUpperCase()
			);
			keyElement.className = keyElement.className.replace('active', '');
		}
	}
	if (event.keyCode == 27) { reset(); }
	if (event.keyCode == 73) { // i
		if (emulator.breakpoint) {
			clearBreakpoint();
		}
		else {
			haltBreakpoint("user interrupt");
		}
	}
	if (event.keyCode == 79 || event.keyCode == 80) { // o or p
		if (emulator.breakpoint) {
			if (event.keyCode == 80)	// p will clear the delay register
				emulator.dt = 0;

			if (emulator.waiting == false) // if the emulator is waiting for key input, do not tick
				emulator.tick();

			renderDisplay(emulator);

			// display an appropriate message based on situation:
			var breaksting = emulator.waiting ? "waiting for input" : "single stepping";
			haltBreakpoint(breaksting);
		}
	}
	if (emulator.waiting) {
		for(var z = 0; z < 16; z++) {
			if (keymap[z] == event.keyCode) {
				emulator.waiting = false;
				emulator.v[emulator.waitReg] = z;
				return;
			}
		}
	}
}

////////////////////////////////////
//
//   Editor
//
////////////////////////////////////

document.getElementById("input").onkeydown = function(event) {
	if (event.keyCode == 9) {
		var text  = this.value;
		var start = this.selectionStart;
		var end   = this.selectionEnd;

		this.value = text.substring(0, start) + '\t' + text.substring(end);
		this.selectionStart = this.selectionEnd = start + 1;
		return false;
	}
};

////////////////////////////////////
//
//   Manual
//
////////////////////////////////////

function toggleManual() {
	var manual = document.getElementById("manual");
	if (manual.style.display == "none") {
		manual.style.display = "inline";
	}
	else {
		manual.style.display = "none";
	}
}

////////////////////////////////////
//
//   Options
//
////////////////////////////////////

function framerate() {
	emulator.tickrate = document.getElementById("framerate").value;
}

function editFore1() {
	var val = document.getElementById("foreEdit1").value;
	document.getElementById("foreSample1").bgColor = val;
	emulator.fillColor = val;
	showPixels();
}

function editFore2() {
	var val = document.getElementById("foreEdit2").value;
	document.getElementById("foreSample2").bgColor = val;
	emulator.fillColor2 = val;
	showPixels();
}

function editBlend() {
	var val = document.getElementById("blendEdit").value;
	document.getElementById("blendSample").bgColor = val;
	emulator.blendColor = val;
	showPixels();
}

function editBack() {
	var val = document.getElementById("backEdit").value;
	document.getElementById("backSample").bgColor = val;
	emulator.backgroundColor = val;
	showPixels();
}

function editBuzz() {
	var val = document.getElementById("buzzEdit").value;
	document.getElementById("buzzSample").bgColor = val;
	emulator.buzzColor = val;
}

function editSilent() {
	var val = document.getElementById("silentEdit").value;
	document.getElementById("silentSample").bgColor = val;
	emulator.quietColor = val;
}

function palettePreset() {
	var val = document.getElementById("palettePreset").value;
	if (val.length < 1) { return; }
	if (val == 'classic') {
		document.getElementById("foreEdit1") .value = "#FFCC00"; editFore1();
		document.getElementById("foreEdit2") .value = "#FF6600"; editFore2();
		document.getElementById("blendEdit") .value = "#662200"; editBlend();
		document.getElementById("backEdit")  .value = "#996600"; editBack();
		document.getElementById("buzzEdit")  .value = "#FFAA00"; editBuzz();
		document.getElementById("silentEdit").value = "#000000"; editSilent();
		return;
	}
	val = JSON.parse(val);
	if (emulator.enableXO) {
		document.getElementById("foreEdit1").value = val[0]; editFore1();
		document.getElementById("foreEdit2").value = val[1]; editFore2();
		document.getElementById("blendEdit").value = val[2]; editBlend();
		document.getElementById("backEdit") .value = val[3]; editBack();
	}
	else {
		document.getElementById("foreEdit1").value = val[0]; editFore1();
		document.getElementById("backEdit" ).value = val[1]; editBack();
	}
	document.getElementById("buzzEdit")  .value = val[4]; editBuzz();
	document.getElementById("silentEdit").value = val[5]; editSilent();
}

function setQuirks(flag) {
	emulator[flag] = document.getElementById(flag).checked;
}

function setEnableXO() {
	var check = document.getElementById("enableXO");
	emulator.enableXO = check.checked;
	if (check.checked) {
		var features = document.getElementsByClassName("xofeature");
		for(var z = 0; z < features.length; z++) {
			var feature = features[z];
			feature.style.display = (feature.tagName == "TR") ? "table-row" : "inline";
		}
	}
}

function toggleOptions() {
	var options = document.getElementById("options");
	if (options.style.display == "none") {
		options.style.display = "inline";
		document.getElementById("spriteEditor").style.display = "none";
		document.getElementById("bintools").style.display = "none";
		document.getElementById("audiotools").style.display = "none";
		document.getElementById("foreEdit1"      ).value   = emulator.fillColor;  editFore1();
		document.getElementById("foreEdit2"      ).value   = emulator.fillColor2; editFore2();
		document.getElementById("blendEdit"      ).value   = emulator.blendColor; editBlend();
		document.getElementById("backEdit"       ).value   = emulator.backgroundColor; editBack();
		document.getElementById("buzzEdit"       ).value   = emulator.buzzColor;  editBuzz();
		document.getElementById("silentEdit"     ).value   = emulator.quietColor; editSilent();
		document.getElementById("shiftQuirks"    ).checked = emulator.shiftQuirks;
		document.getElementById("loadStoreQuirks").checked = emulator.loadStoreQuirks;
		document.getElementById("vfOrderQuirks"  ).checked = emulator.vfOrderQuirks;
		document.getElementById("clipQuirks"     ).checked = emulator.clipQuirks;
		document.getElementById("jumpQuirks"     ).checked = emulator.jumpQuirks;
		document.getElementById("enableXO"       ).checked = emulator.enableXO;
	}
	else {
		options.style.display = "none";
	}
}

////////////////////////////////////
//
//   Sprite editor stuff:
//
////////////////////////////////////

function toggleSpriteEditor() {
	var editor = document.getElementById("spriteEditor");
	if (editor.style.display == "none") {
		editor.style.display = "inline";
		document.getElementById("options").style.display = "none";
		document.getElementById("bintools").style.display = "none";
		document.getElementById("audiotools").style.display = "none";
		showPixels();
	}
	else {
		editor.style.display = "none";
	}
}

function drawPalette() {
	var palette = document.getElementById("spriteEditorPalette");
	var render = palette.getContext("2d");
	render.clearRect(0, 0, palette.width, palette.height);
	for(var z = 0; z < 4; z++) {
		render.fillStyle = getColor(z);
		render.fillRect(z * 50, 0, 50, 25);

		render.fillStyle = "#000000";
		render.lineWidth = 0;
		// note: line drawing must occur at coordinates between pixels
		// to render accurate, crisp lines. This is ridiculous.
		if (z > 0) {
			render.beginPath();
			render.moveTo(z * 50 + 0.5, 0);
			render.lineTo(z * 50 + 0.5, 25);
			render.stroke();
		}
		if (z == selectedColor) {
			render.beginPath();
			if (z == 0) { render.rect(z * 50 + 1.5, 1.5, 47, 22); }
			else        { render.rect(z * 50 + 2.5, 1.5, 46, 22); }
			render.stroke();
		}
	}
}

function clickPalette(event) {
	var rect = document.getElementById("spriteEditorPalette").getBoundingClientRect();
	var mx = Math.floor((event.clientX - rect.left)/50);
	selectedColor = Math.max(0, Math.min(mx, 3));
	drawPalette();
}

function setSpriteEditorColor() {
	var check = document.getElementById("spriteEditorColor");
	var palette = document.getElementById("spriteEditorPalette");
	enableColor = check.checked;
	if (check.checked) {
		palette.style.display = "inline";
		drawPalette();
	}
	else {
		selectedColor = 1;
		palette.style.display = "none";
		var maxBytes = largeSprite ? 32 : 15;
		for(var z = maxBytes; z < 64; z++) { pixel[z] = 0; }
	}
	showPixels();
	showHex();
}

function setSpriteEditorSize() {
	var check = document.getElementById("spriteEditorSize");
	var canvas = document.getElementById("draw");
	if (check.checked) {
		largeSprite = true;
		canvas.width  = 25 * 16;
		canvas.height = 25 * 16;
		var newpixels = [];
		for(var z = 0; z < 64; z++) { newpixels[z] = 0; }
		for(var z = 0; z < 15; z++) {
			newpixels[z * 2] = pixel[z];
		}
		if (enableColor) {
			for(var z = 0; z < 15; z++) {
				newpixels[32 + (z * 2)] = pixel[15 + z];
			}
		}
		pixel = newpixels;
	}
	else {
		largeSprite = false;
		canvas.width  = 25 * 8;
		canvas.height = 25 * 15;
		var newpixels = [];
		for(var z = 0; z < 64; z++) { newpixels[z] = 0; }
		for(var z = 0; z < 15; z++) {
			newpixels[z] = pixel[z*2];
		}
		if (enableColor) {
			for(var z = 0; z < 15; z++) {
				newpixels[15 + z] = pixel[32 + z*2];
			}
		}
		pixel = newpixels;
	}
	showPixels();
	showHex();
}

function showPixels() {
	var canvas = document.getElementById("draw");
	var render = canvas.getContext("2d");
	render.fillStyle = emulator.backgroundColor;
	render.fillRect(0, 0, canvas.width, canvas.height);
	if (largeSprite) {
		for(var row = 0; row < 16; row++) {
			for(var col = 0; col < 16; col++) {
				var index = row*2 + (col > 7 ? 1:0);
				var mask  = (1 << (7-(col%8)));
				var set1 = (pixel[index     ] & mask) != 0;
				var set2 = (pixel[index + 32] & mask) != 0;
				if (!enableColor) { set2 = 0; }
				render.fillStyle = getColor(set1 + (2*set2));
				render.fillRect(col * 25, row * 25, 25, 25);
			}
		}
	}
	else {
		for(var row = 0; row < 15; row++) {
			for(var col = 0; col < 8; col++) {
				var mask = (1 << (7-col));
				var set1 = (pixel[row     ] & mask) != 0;
				var set2 = (pixel[row + 15] & mask) != 0;
				if (!enableColor) { set2 = 0; }
				render.fillStyle = getColor(set1 + (2*set2));
				render.fillRect(col * 25, row * 25, 25, 25);
			}
		}
	}
}

function showHex() {
	var output = document.getElementById("spriteData");
	var hex = "";
	var maxBytes = largeSprite ? 32 : 15;
	if (enableColor) { maxBytes *= 2; }
	for(var z = 0; z < maxBytes; z++) {
		var digits = pixel[z].toString(16).toUpperCase();
		hex += "0x" + (digits.length == 1 ? "0"+digits : digits) + " ";
		if (z % 8 == 7) { hex += "\n"; }
	}
	output.value = hex;
}

function editHex() {
	var output = document.getElementById("spriteData");
	var bytes = output.value.trim().split(new RegExp("\\s+"));
	var maxBytes = largeSprite ? 32 : 15;
	if (enableColor) { maxBytes *= 2; }
	for(var z = 0; z < maxBytes; z++) {
		if (z < bytes.length) {
			var tok = bytes[z].trim();
			var num = (tok.slice(0, 2) == "0b") ? parseInt(tok.slice(2),2) : parseInt(tok);
			pixel[z] = isNaN(num) ? 0 : num;
		}
		else {
			pixel[z] = 0;
		}
	}
	showPixels();
}

function drag(event) {
	if (mode == 0) { return; }
	var rect = document.getElementById("draw").getBoundingClientRect();
	var mx     = Math.floor((event.clientX - rect.left)/25);
	var my     = Math.floor((event.clientY - rect.top )/25);
	var dest   = largeSprite ? (my*2 + (mx > 7 ? 1:0)) : my;
	var stride = largeSprite ? 32 : 15;
	var src    = (128 >> (mx % 8));
	if (mode == 1) {
		// draw
		if ((selectedColor & 1) != 0) { pixel[dest]          |=  src; }
		else                          { pixel[dest]          &= ~src; }
		if ((selectedColor & 2) != 0) { pixel[dest + stride] |=  src; }
		else                          { pixel[dest + stride] &= ~src; }
	}
	else {
		pixel[dest]          &= ~src; // erase
		pixel[dest + stride] &= ~src;
	}
	showHex();
	showPixels();
}

function release(event)    { mode = 0; drag(event); }
function pressDraw(event)  { if (event.button == 2) {mode = 2;} else {mode = 1;} drag(event); }

var largeSprite = false;
var mode = 0;
var enableColor = false;
var selectedColor = 1;
var pixel = [];
for(var z = 0; z < 64; z++) { pixel[z] = 0; }

var spriteCanvas = document.getElementById("draw");
spriteCanvas.addEventListener("mousemove", drag, false);
spriteCanvas.addEventListener("mousedown", pressDraw, false);
spriteCanvas.addEventListener("mouseup"  , release, false);
spriteCanvas.oncontextmenu = function(event) { drag(event); return false; };
spriteCanvas.addEventListener("mouseout", release, false);
var spriteEditorPalette = document.getElementById("spriteEditorPalette");
spriteEditorPalette.addEventListener("click", clickPalette, false);

////////////////////////////////////
//
//   Virtual Keypad
//
////////////////////////////////////

function buttonDn(key) {
	keyDown({ keyCode: keymap[key]});
}
function buttonUp(key) {
	if (keymap[key] in emulator.keys) {
		keyUp({ keyCode: keymap[key]});
	}
}

for(var k = 0; k <= 0xF; k++) {
	var hex = k.toString(16).toUpperCase();
	var button = document.getElementById("0x" + hex);
	button.onmousedown = buttonDn.bind(undefined, k);
	button.onmouseup   = buttonUp.bind(undefined, k);
	button.onmouseout  = buttonUp.bind(undefined, k);

	button.ontouchstart = buttonDn.bind(undefined, k);
	button.ontouchenter = buttonDn.bind(undefined, k);
	button.ontouchleave = buttonUp.bind(undefined, k);
}

function toggleKeypad() {
	var keypad = document.getElementById("keypad");
	if (keypad.style.display == "none") {
		keypad.style.display = "inline";
	}
	else {
		keypad.style.display = "none";
	}
}

////////////////////////////////////
//
//   Debugger
//
////////////////////////////////////
var curBreakName;

var regNumFormat = {
	"pc": "hex",
	"i" : "hex",
	0x0 : "hex",
	0x1 : "hex",
	0x2 : "hex",
	0x3 : "hex",
	0x4 : "hex",
	0x5 : "hex",
	0x6 : "hex",
	0x7 : "hex",
	0x8 : "hex",
	0x9 : "hex",
	0xA : "hex",
	0xB : "hex",
	0xC : "hex",
	0xD : "hex",
	0xE : "hex",
	0xF : "hex"
}

function cycleNumFormat(register) {
	var curFormat = regNumFormat[register];
	if (!curFormat) {
		return;
	}

	if (curFormat == "hex") {
		regNumFormat[register] = "bin";
	}
	else if (curFormat == "bin") {
		regNumFormat[register] = "dec";
	}
	else {
		regNumFormat[register] = "hex";
	}

	haltBreakpoint(curBreakName);
}

function getLabel(address) {
	var bestname = "hex-font";
	var besta = 0;
	for(var key in emulator.metadata.labels) {
		var v = emulator.metadata.labels[key];
		if ((v > besta) && (v <= address)) {
			bestname = key;
			besta = v;
		}
	}
	if (besta == address) { return " (" + bestname + ")"; }
	return " (" + bestname + " + " + (address - besta) + ")";
}

function formatAliases(id) {
	var names = [];
	for(var key in emulator.metadata.aliases) {
		if (emulator.metadata.aliases[key] == id) { names.push(key); }
	}
	if (names.length == 0) { return ""; }
	var ret = " (" + names[0];
	for(var x = 1; x < names.length; x++) {
		ret += ", " + names[x];
	}
	return ret + ")";
}

function haltBreakpoint(breakName) {
	var button = document.getElementById("continueButton");
	var regs   = document.getElementById("registerView");
	button.style.display = "inline";
	regs.style.display = "inline";

	var regdump =
		"<span>tick count: " + emulator.tickCounter + "</span><br>" +
		"<span>breakpoint: " + breakName + "</span><br>" +
		"<span onClick=\"cycleNumFormat('pc');\">pc := " + numericFormat(emulator.pc, regNumFormat["pc"]) + getLabel(emulator.pc) + "</span><br>" +
		// real time dissassembly of command being performed:
		//"cmd = " + hexFormat(emulator.m[emulator.pc]) + hexFormat(emulator.m[emulator.pc + 1]).slice(2) + "<br>(" + dissaassmbledInstruction + ")<br>" +
		"<span onClick=\"cycleNumFormat('i');\">i := " + numericFormat(emulator.i, regNumFormat["i"]) + getLabel(emulator.i) + "</span><br>";
	for(var k = 0; k <= 0xF; k++) {
		var hex = k.toString(16).toUpperCase();
		regdump += "<span onClick=\"cycleNumFormat('"+ k + "');\">v" + hex + " := " + numericFormat(emulator.v[k], regNumFormat[k]) + formatAliases(k) + "</span><br>";
	}

	regdump += "<br>inferred stack trace:<br>";
	for(var x = 0; x < emulator.r.length; x++) {
		regdump += hexFormat(emulator.r[x]) + getLabel(emulator.r[x]) + "<br>";
	}

	var dbg = emulator.metadata.dbginfo;

	// scan backwards & forwards in memory as long as addrs map to nearby lines
	var pcline = dbg.locs[emulator.pc];
	var memlo = emulator.pc, memhi = emulator.pc;
	while (dbg.locs[memlo - 1] > pcline - 8) memlo--;
	while (dbg.locs[memhi + 1] < pcline + 8) memhi++;

	var ind = memlo;

	regdump += '<br><table class="debugger"><tr><td>addr</td><td>data</td><td style="width:40em">source</td></tr>\n';
	for (var line = dbg.locs[memlo]; line <= dbg.locs[memhi]; line++) {
		if (dbg.lines[line].match(/^\s*$/)) continue;  // skip empty lines
		if (dbg.locs[ind] == line) {
			regdump += dbg.locs[ind] == pcline ? '<tr class="debugger-searchline">' : '<tr>';
			regdump += "<td>" + hexFormat(ind).slice(2) + "</td><td>";
			for (; dbg.locs[ind] == line; ind++) {
				regdump += hexFormat(emulator.m[ind]).slice(2);
			}
			regdump += "</td>";
		} else {
			regdump += "<tr><td></td><td></td>";
		}
		regdump += "<td><pre>" + escapeHtml(dbg.lines[line]) + "</pre></td></tr>\n";
	}

	regs.innerHTML = regdump;
	emulator.breakpoint = true;
	curBreakName = breakName;
	exRegDump();
}

function exRegDump()
{
	var exregs   = document.getElementById("exRegisterView");
	if (exregs.style.display == "none") { return; }
	var exview   = document.getElementById("exview");
	var exregdump = "";

	var dbg = emulator.metadata.dbginfo;

	// scan backwards & forwards in memory as long as addrs map to nearby lines
	var pcline = dbg.locs[emulator.pc];
	var memlo = emulator.pc, memhi = emulator.pc;
	while (dbg.locs[memlo - 1] > pcline - 8) memlo--;
	while (dbg.locs[memhi + 1] < pcline + 8) memhi++;

	// Compressed memory view:
	exregdump += "<table class=\"memdump\"><tr>";
	exregdump += '<td style="max-width:15px">PC:</td><td style="padding-left:6px" colspan="2" id="txtP0" onclick="memEditEnable(\'P0\')">' + hexFormat(emulator.pc,4,true) + '</td><td>I:</td><td colspan="2" id="txtP1" onclick="memEditEnable(\'P1\')">' + hexFormat(emulator.i,4,true) + '</td>';
	exregdump += '<td>D:</td><td id="txtP2" onclick="memEditEnable(\'P2\')">' + hexFormat(emulator.dt,2,true) + "</td>";
	exregdump += "</tr><tr>";
	for(var k = 0; k <= 0xF; k++) {
		var hex = k.toString(16).toUpperCase();
		var value = hexFormat(emulator.v[k],2,true);
		var addr = "R" + k;
		exregdump += '<td id="txt' + addr + '"onclick=\'memEditEnable("' + addr + '")\'>';
		exregdump += value;
		exregdump += "</td>";

		if (k == 7)
			exregdump += "</tr><tr>";
	}
	exregdump += "</tr></table>"

	// Dissassemble commands around the PC value
	// memhi = memhi > 4096 ? 0 : memhi // what is the high limit?
	// Set this based on emulator.enableXO
	var memcap = emulator.enableXO == true ? 0xFFFF : 0xFFF;
	memlo = emulator.pc - 6;
	memhi = emulator.pc + 6;
	if (memlo < 0) memlo = 0;
	if (memhi >= memcap) memhi = memcap - 1;
	for (var mem = memlo; mem <= memhi; mem += 2)
	{
		if (mem == emulator.pc)
			exregdump += "<span class='memhighlight'>";
		var a = emulator.m[mem];
		var nn = emulator.m[mem+1];
		var thisHex = "";
		//thisHex += hexFormat(mem,4).slice(2) + ": " +
		thisHex += hexFormat(a,2,true) + hexFormat(nn,2,true);
		exregdump += "<br>" + thisHex + " " + realTimeDissassemble(a, nn);
		if (mem == emulator.pc)
			exregdump += "</span>";
	}

	buildMemBox(memcap);

	exview.innerHTML = exregdump;
}

function toggleExtendedDebugger()
{
	var exregs   = document.getElementById("exRegisterView");
	if (exregs.style.display == "none")
	{
		exregs.style.display = "inline";
		exRegDump();
	} else {
		exregs.style.display = "none";
	}
}

function rescanMemBox()
{
	document.getElementById("txtM0").innerText = "-1";
	document.getElementById("txtM1").innerText = "-1";
	buildMemBox(-1);
}

function buildMemBox(memcap)
{
	var membox = document.getElementById("memorybox");

	var memmin = 0;
	var imemmin = parseInt(document.getElementById("txtM0").innerText, 16);
	if (imemmin == -1)
	{
	} else {
		memmin = imemmin;
	}
	if (memmin % 256 != 0)
	{
		memmin = memmin - (memmin % 256) + 256;
	}

	var memmax = emulator.m.length;
	var imemmax = parseInt(document.getElementById("txtM1").innerText, 16);
	if (imemmax == -1)
	{
		for(var x = memmax - 1; x >= 0; x--)
		{
			if (emulator.m[x] != 0)
			{
				memmax = x;
				x = -1;
			}
		}
		if (emulator.pc + 2 > memmax)
		{
			memmax = emulator.pc + 2;
		}
		if (emulator.i + 1 > memmax)
		{
			memmax = emulator.i + 1;
		}
	} else {
		memmax = imemmax;
	}
	if (memmax % 256 != 0)
	{
		memmax = memmax - (memmax % 256) + 256;
	}

	document.getElementById("txtM0").innerText = hexFormat(memmin, 4, true);
	document.getElementById("txtM1").innerText = hexFormat(memmax - 1, 4, true);
	if (membox.innerText == "" || document.getElementsByClassName("membyte").length != memmax || memcap == -1)
	{
		// Display the memory cap:
		//exregdump += "<br><br>Memory space: " + memcap;
		// New memdump stuff.
		var memboxdump = "";
		memboxdump += '<br><table class="memdump"><tr><td>addr</td><td colspan="16">data</td></tr>\n';
		//regdump += "<br>";
		var wrap = 0;
		var color = '';
		//for (var addr = memlo; addr < memhi; addr++) {
		//for (var addr = 0; addr <= memcap; addr++) {
		for (var addr = memmin; addr < memmax; addr++) {
			if (wrap == 0) {
				memboxdump += '<tr>';
				memboxdump += "<td>" + hexFormat(addr, 4) + ":</td>";
			}

			var highclass = "";
			if (addr == emulator.pc)
			{
				highclass += "pcmem memhighlight ";
			} else if (addr == emulator.pc + 1) {
				highclass += "pcmem memhighlight ";
			}
			if (addr == emulator.i) {
				highclass += "imem ihighlight ";
			}

			memboxdump += '<td class="membyte ' + highclass + '" id="txt' + addr + '"onclick=\'memEditEnable("' + addr + '")\'>';

			var data = emulator.m[addr];
			var value = data == undefined ? "xx" : hexFormat(data,2,true);

			memboxdump += value;

			memboxdump += "</td>";

			wrap++;
			if (wrap == 0x10)
			{
				memboxdump += '</tr>';
				wrap = 0;
			}
		}
		memboxdump += "</table><br>";

		membox.innerHTML = memboxdump;
	} else {
		var pcmem = document.getElementsByClassName("pcmem");
		if (pcmem.length > 0)
		{
			pcmem[0].className = "membyte";
		}
		pcmem = document.getElementsByClassName("pcmem");
		if (pcmem.length > 0)
		{
			pcmem[0].className = "membyte";
		}
		pcmem = document.getElementsByClassName("imem");
		if (pcmem.length > 0)
		{
			pcmem[0].className = "membyte";
		}

		var element = document.getElementById("txt" + emulator.pc);
		if (element != null)
		{
			element.className += " pcmem memhighlight ";
		}
		element = document.getElementById("txt" + (emulator.pc + 1));
		if (element != null)
		{
			element.className += " pcmem memhighlight ";
		}
		element = document.getElementById("txt" + emulator.i)
		if (element != null)
		{
			element.className += " imem ihighlight ";
		}

		var start = emulator.i - 32;
		var end = emulator.i + 32;
		for (var i = start; i <= end; i++) {
			var data = emulator.m[(memmax + i) % memmax];
			var value = data == undefined ? "xx" : hexFormat(data,2,true);
			var txt = document.getElementById("txt" + (memmax + i) % memmax);
			if (txt != null)
			{
				txt.innerText = value;
			}
		};
	}

	if (membox.className == "memorybox")
	{
		scrollPC();
	}
}

function memEditEnable(addr)
{
	var txt = document.getElementById("txt" + addr);
	var memtext = document.getElementById("addr" + addr);
	if (memtext != null) { return; }
	var oldmem = txt.innerText;
	if (addr.substring(0, 1) == "P")
	{
		if (addr.substring(1) == "2")
		{
			txt.innerHTML = '<textarea maxlength="2" class="memtext" id="addr' + addr + '" onblur="memEdit(\'addr' + addr + '\')">' + oldmem + '</textarea>';
		} else {
			txt.innerHTML = '<textarea maxlength="4" class="memtext memtext4" id="addr' + addr + '" onblur="memEdit(\'addr' + addr + '\')">' + oldmem + '</textarea>';
		}
	} else if (addr.substring(0, 1) == "M") {
		txt.innerHTML = '<textarea maxlength="4" class="memhiloedit" id="addr' + addr + '" onblur="memEdit(\'addr' + addr + '\')">' + oldmem + '</textarea>';
	} else {
		txt.innerHTML = '<textarea maxlength="2" class="memtext" id="addr' + addr + '" onblur="memEdit(\'addr' + addr + '\')">' + oldmem + '</textarea>';
	}
	memtext = document.getElementById("addr" + addr);
	memtext.focus();
	memtext.select();
}

function memEdit(addr)
{
	var memtext = document.getElementById(addr);
	addr = addr.substring(4);
	var register = false;
	var pointer = false;
	var memedit = false;
	var iLen = 2;
	var iMax = 0xFF;
	if (addr.substring(0, 1) == "R")
	{
		register = true;
	} else if (addr.substring(0, 1) == "P") {
		pointer = true;
	} else if (addr.substring(0, 1) == "M") {
		memedit = true;
	}
	var oldval;
	if (!register && !pointer && !memedit)
	{
		oldval = emulator.m[addr];
		if (oldval != undefined)
		{
			oldval = hexFormat(oldval, 2, true);
		} else {
			oldval = "00";
		}
	} else if (register) {
		oldval = hexFormat(emulator.v[addr.substring(1)], 2, true);
	} else if (pointer) {
		iLen = 4;
		iMax = 0xFFFF;
		if (addr.substring(1) == "0")
		{
			oldval = hexFormat(emulator.pc,4,true);
		} else if (addr.substring(1) == "1") {
			oldval = hexFormat(emulator.i,4,true);
		} else if (addr.substring(1) == "2"){
			iLen = 2;
			iMax = 0xFF;
			oldval = hexFormat(emulator.dt,4,true);
		}
	} else if (memedit) {
		iLen = 4;
		iMax = 0xFFFF;
		if (addr.substring(1) == "0")
		{
			oldval = "0000";
		} else if (addr.substring(1) == "1") {
			oldval = "FF";
		}
	}
	if (oldval != undefined)
	{
		var newval = memtext.value.toUpperCase();
		if (newval == "")
		{
			newval = oldval;
		}
		if (isNaN(parseInt(newval, 16)))
		{
			newval = oldval;
		}
		while (newval.toString().length < iLen)
		{
			newval = "0" + newval;
		}
		if (parseInt(newval, 16) >= 0 && parseInt(newval, 16) <= iMax)
		{
			if (!register && !pointer && !memedit)
			{
				emulator.m[addr] = parseInt(newval, 16);
			} else if (register) {
				emulator.v[addr.substring(1)] = parseInt(newval, 16);
			} else if (pointer) {
				if (addr.substring(1) == "0")
				{
					emulator.pc = parseInt(newval, 16);
				} else if (addr.substring(1) == "1") {
					emulator.i = parseInt(newval, 16);
				} else if (addr.substring(1) == "2") {
					emulator.dt = parseInt(newval, 16);
				}
				buildMemBox(emulator.m.length);
			} else if (memedit) {
				document.getElementById("txt" + addr).innerHTML = newval;
				buildMemBox(-1);
			}
		} else {
			newval = oldval;
		}
	} else {
		newval = "xx";
	}
	document.getElementById("txt" + addr).innerHTML = newval;
}

function clearDelay()
{
	emulator.dt = 0;
}

function scrollPC()
{
	var redmem = document.getElementsByClassName("pcmem");
	var membox = document.getElementById("memorybox");
	if (redmem[0] != null)
	{
		/*
		redmem[0].scrollIntoView(false);
		if (membox.scrollTop != 0)
		{
			membox.scrollTop += membox.clientHeight * 0.5;
		}
		*/
		membox.scrollTop = redmem[0].offsetTop + 32 - membox.clientHeight * 0.5;
	} else {
		//console.log("Can't find PC to scroll to!");
	}
}

function scrollI()
{
	var redmem = document.getElementsByClassName("imem");
	if (redmem == null)
	{
		redmem = document.getElementsByClassName("pcmem");
	}
	var membox = document.getElementById("memorybox");
	if (redmem[0] != null)
	{
		membox.scrollTop = redmem[0].offsetTop + 32 - membox.clientHeight * 0.5;
	} else {
		//console.log("Can't find I to scroll to!");
	}
}

function realTimeDissassemble(a, nn)
{
	var dissassembledInstruction = formatInstruction(a, nn, realTimeDissassebmlyLabel);

	if ((a & 0xF0) == 0x20)
		dissassembledInstruction = "Gosub " + dissassembledInstruction;

	return dissassembledInstruction;
}

function realTimeDissassebmlyLabel(nnn)
{
	return hexFormat(nnn) + " " + getLabel(nnn);
}

function clearBreakpoint() {
	var button = document.getElementById("continueButton");
	var regs   = document.getElementById("registerView");
	button.style.display = "none";
	regs.style.display = "none";
	emulator.breakpoint = false;
	curBreakName = undefined;
}

////////////////////////////////////
//
//   Decompiler
//
////////////////////////////////////

function setMaskFormatOverride() {
	var check = document.getElementById("maskOverride");
	emulator.maskFormatOverride = check.checked;
}

function setNumericFormat() {
	var val = document.getElementById("numericFormat").value;
	emulator.numericFormatStr = val.length < 1 ? "default"  : val;
}

function toggleBinaryTools() {
	var tools = document.getElementById("bintools");
	document.getElementById("maskOverride").checked = emulator.maskFormatOverride;
	document.getElementById("numericFormat").value = emulator.numericFormatStr;
	if (tools.style.display == "none") {
		tools.style.display = "inline";
		document.getElementById("options").style.display = "none";
		document.getElementById("spriteEditor").style.display = "none";
		document.getElementById("audiotools").style.display = "none";
	}
	else {
		tools.style.display = "none";
	}
}

function toggleCodeScroll() {
	var membox = document.getElementById("memorybox");
	var scrolllock = document.getElementById("memscrolllock");
	if (membox.className.includes("noscroll"))
	{
		var classes = membox.className.split(" ");
		classes.splice(classes.indexOf("noscroll"), 1);
		membox.className = classes.join(" ");
		scrolllock.innerHTML = "&#128275;";
	} else {
		membox.className += " noscroll";
		scrolllock.innerHTML = "&#128274;";
	}
}

function decompileFile() {
	document.getElementById("fileinput").click();
}

function decompileRequestLoad() {
	var file = document.getElementById("fileinput").files[0];
	var reader = new FileReader();

	function actuallyLoad() {
		var buff = reader.result;
		var bytes = new Uint8Array(buff);
		var disp = "";
		if (bytes.length > 0) {
			disp = hexFormat(bytes[0]);
		}
		for(var z = 1; z < bytes.length; z++) {
			disp += ", " + hexFormat(bytes[z]);
		}
		document.getElementById("decompileInput").value = "[" + disp + "]";
	}

	reader.onload = actuallyLoad;
	reader.readAsArrayBuffer(file);
}

function getDecompileData() {
	var inData = document.getElementById("decompileInput").value;
	inData = inData.replace("[", "");
	inData = inData.replace("]", "");
	inData = inData.split(",");
	var buffer = [];
	for(var z = 0; z < inData.length; z++) {
		buffer[z] = parse(inData[z].trim());
	}
	return buffer;
}

function decompileRun() {
	var buffer = getDecompileData();
	runRom({ rom:buffer, breakpoints:{}, aliases:{}, labels:{} });
}

var decompileProgramLength = 0;

function decompileStart() {
	document.getElementById("decompileWork").style.display = "inline";
	var buffer = getDecompileData();
	var quirks = {};
	quirks['shiftQuirks'    ] = emulator.shiftQuirks;
	quirks['loadStoreQuirks'] = emulator.loadStoreQuirks;
	quirks['vfOrderQuirks'  ] = emulator.vfOrderQuirks;
	quirks['jumpQuirks'     ] = emulator.jumpQuirks;
	analyzeInit(buffer, quirks);
	decompileProgramLength = buffer.length;
	window.setTimeout(decompileProcess, 0);
}

function decompileProcess() {
	var finished = false;
	for(var z = 0; z < 100; z++) {
		finished |= analyzeWork();
		if (finished) { break; }
	}
	if (finished) {
		analyzeFinish();
		document.getElementById("input").value = "# decompiled program:\n" + formatProgram(decompileProgramLength);
		document.getElementById("decompileWork").style.display = "none";
	}
	else {
		window.setTimeout(decompileProcess, 0);
	}
}


////////////////////////////////////
//
//   Examples
//
////////////////////////////////////

function loadExample() {
	var v = document.getElementById("examples").value;
	if (v == "") { return; }
	var xhr = new XMLHttpRequest();
	xhr.open("GET", v);
	xhr.onreadystatechange = function() {
		if (xhr.readyState != 4 || xhr.status != 200) {
			return;
		}
		var result = JSON.parse(xhr.responseText);
		var stripped = result["content"].replace(/(?:\r\n|\r|\n)/g, "");
		var decoded = window.atob(stripped);
		document.getElementById("input").value = decoded;
	}
	xhr.send();
}

function listExamples() {
	var xhr = new XMLHttpRequest();
	var exampledir = "https://api.github.com/repos/JohnEarnest/Octo/contents/examples";
	xhr.open("GET", exampledir);
	xhr.onreadystatechange = function() {
		if (xhr.readyState != 4 || xhr.status != 200) {
			return;
		}
		var result = JSON.parse(xhr.responseText);
		for(var index = 0; index < result.length; index++) {
			var option = document.createElement("option");
			option.text = result[index]["name"];
			option.value = result[index]["url"];
			document.getElementById("examples").add(option);
		}
	}
	xhr.send();
}

listExamples();


////////////////////////////////////
//
//   Audio Editor UI
//
////////////////////////////////////

function toggleAudioEditor() {
	var audio = document.getElementById("audiotools");
	if (audio.style.display == "none") {
		document.getElementById("options").style.display = "none";
		document.getElementById("spriteEditor").style.display = "none";
		document.getElementById("bintools").style.display = "none";
		audio.style.display = "inline";
		drawAudio();
	}
	else {
		audio.style.display = "none";
	}
}

function presetAudio() {
	document.getElementById("audioPattern").value = document.getElementById("audioPreset").value;
	drawAudio();
}

function randomAudio() {
	var ret = "";
	for(var z = 0; z < 16; z++) {
		ret += hexFormat(Math.floor(Math.random() * 255)) + " ";
	}
	document.getElementById("audioPattern").value = ret;
	drawAudio();
}

function swapWaveforms(x, y) {
	var a = document.getElementById(x).value;
	var b = document.getElementById(y).value;
	document.getElementById(x).value = b;
	document.getElementById(y).value = a;
	drawAudio();
}

function shiftAudio(delta) {
	var audioPattern = parseAudio("audioPattern");
	var result = "";
	for(var z = 0; z < 16; z++) {
		var b = 0;
		for(var index = 0; index < 8; index++) {
			var sourceIndex = (index + delta + (z * 8)) & 127;
			var sourceByte  = Math.floor(sourceIndex / 8);
			var sourceBit   = 7 - Math.floor(sourceIndex % 8);
			b = (b <<= 1) | ((audioPattern[sourceByte] >> sourceBit) & 1);
		}
		result += hexFormat(b) + " ";
	}
	document.getElementById("audioPattern").value = result;
	drawAudio();
}

function blendWaveform(func) {
	var audioPattern = parseAudio("audioPattern");
	var blendPattern = parseAudio("blendPattern");
	function blend(target, dyad) {
		var data = "";
		for(var z = 0; z < audioPattern.length; z++) {
			data += hexFormat(dyad(audioPattern[z], blendPattern[z]) & 0xFF) + " ";
		}
		document.getElementById(target).value = data;
	}

	if (func == 'xor') {
		blend("audioPattern", function(a, b) { return a ^ b; });
	}
	if (func == 'and') {
		blend("audioPattern", function(a, b) { return a & b; });
	}
	if (func == 'or') {
		blend("audioPattern", function(a, b) { return a | b; });
	}
	if (func == 'not') {
		blend("blendPattern", function(a, b) { return (~b); });
	}
	drawAudio();
}

function generateWaveform() {
	var canvas = document.getElementById("waveform");
	var h = canvas.height;
	var w = canvas.width;
	var g = canvas.getContext("2d");
	g.fillStyle = emulator.backgroundColor;
	g.fillRect(0, 0, canvas.width, canvas.height);

	// Samples are played at 4000 samples/second.
	// 128 samples is (1 seconds / 4000 * 128) = .032 seconds.
	// This also means that a full 128 bit pattern is ~ 2/60ths of a second.
	// A sine wave at N hz would be given by sin(t * N * 2Pi).

	var frequency = parseInt(document.getElementById("frequency").value);
	var cutoff    = parseInt(document.getElementById("cutoff").value);

	var word = 0;
	var pattern = "";

	for(var z = 0; z < 128; z++) {
		var t = z * (1 / 4000);                        // time in seconds
		var v = Math.sin(t * frequency * 2 * Math.PI); // sine wave
		var s = Math.floor((v + 1) * 128);             // offset and scale

		// draw some nice waveform displays
		g.fillStyle = emulator.fillColor2;
		g.fillRect(z*(w/128), h-(s*(h/256)), (w/128), s*(h/256));
		if (s >= cutoff) {
			g.fillStyle = emulator.fillColor;
			g.fillRect(z*(w/128), h-(cutoff*(h/256)), (w/128), cutoff*(h/256));
		}

		// build up a bit vector
		word = (word << 1) | ((s >= cutoff) ? 1 : 0);
		if ((z % 8) == 7) {
			pattern += hexFormat(word) + " ";
			word = 0;
		}
	}
	document.getElementById("generatedPattern").value = pattern;
}
generateWaveform();

function parseAudio(id) {
	function parse(token) {
		var num = (token.slice(0, 2) == "0b") ? parseInt(token.slice(2),2) : parseInt(token);
		return isNaN(num) ? token : num;
	}
	var pattern = document.getElementById(id).value;
	pattern = pattern.replace("[", "");
	pattern = pattern.replace("]", "");
	pattern = pattern.split(/\s+/);
	var buffer = [];
	for(var z = 0; z < 16; z++) { buffer[z] = 0; }
	for(var z = 0; z < Math.min(pattern.length, 16); z++) {
		buffer[z] = parse(pattern[z]);
	}
	return buffer;
}

function drawAudio() {
	var canvas = document.getElementById("drawAudio");
	var render = canvas.getContext("2d");
	render.fillStyle = emulator.backgroundColor;
	render.fillRect(0, 0, canvas.width, canvas.height);
	render.fillStyle = emulator.fillColor;

	var buffer = parseAudio("audioPattern");
	for(var z = 0; z < 8 * 16; z++) {
		var a = Math.floor(z / 8);
		var b = 7 - Math.floor(z % 8);
		if (((buffer[a] >> b) & 1) == 0) { continue; }
		render.fillRect(z * 2, 0, 2, 32);
	}
}

function playAudio() {
	// initialize sound if necessary
	if (!audioSetup()) {
		document.getElementById("audioError").innerHTML = "Your browser doesn't support HTML5 Audio!";
		return;
	}

	// parse the sound length
	var soundLength = parseInt(document.getElementById("time").value);
	if (typeof soundLength != "number" || isNaN(soundLength)) {
		document.getElementById("error").innerHTML = "Invalid Duration.";
		return;
	}

	// parse the input string into a byte array, padding with zeros if necessary:
	var buffer = parseAudio("audioPattern");

	playPattern(soundLength, buffer);
}
