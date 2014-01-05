
function hex(d, padding) {
    var hex = Number(d).toString(16);
    padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

    while (hex.length < padding) {
        hex = "0" + hex;
    }

    return hex;
}


window.onload = function() {
	var xhr = new XMLHttpRequest();
 
	xhr.onreadystatechange = function () {
		if (xhr.readyState == xhr.DONE) {
			if (xhr.status == 200 && xhr.response) {
					new chip8(new Uint8Array(xhr.response));
			} else {
				alert("Failed to download:" + xhr.status + " " + xhr.statusText);
			}
		}
	}
 
	xhr.open("GET", "GAMES/PONG", true);
	xhr.responseType = "arraybuffer";
	xhr.send();
}


function chip8(program) {
	this.program = program;

	// Load fontset
	for (var i=0; i < this.fontset.length; i++) {
		this.M[i] = this.fontset[i] 

	}
	for (var i=0; i < this.program.length; i++) {
		this.M[i + 0x200] = this.program[i]
	}
	var example = document.getElementById('c');
	var context = example.getContext('2d');
	context.fillStyle = 'red';
	context.fillRect(30, 30, 50, 50);

	setInterval(this.dump_memory.bind(this), 1000);
	setInterval(this.run.bind(this), 10);
}

// Chip8 memory, registers and stack
chip8.prototype.program = null
chip8.prototype.pc = 0x200;
chip8.prototype.opcode = 0;
chip8.prototype.I = 0;
chip8.prototype.sp = 0;
chip8.prototype.V = [0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,
                     0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0]
chip8.prototype.S = [0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0,
                     0x0,0x0,0x0,0x0,0x0,0x0,0x0,0x0]
chip8.prototype.M = new Uint8Array(4096);

chip8.prototype.d = function(mem) {
	var buf = ""
	for (var i=0; i < mem.length; i++) {
		var type = "";
		if (i%16 == 0) {
			buf+="\n <span class='head'>" + hex(i, 4) + "</span> ";
		}
		if (i == this.pc)
			type = "pc";
		else if (i >= 0x050 && i < 0x0a0)
			type = "pixel_font_set";
		else if (i <= 0x1ff)
			type = "font_set";
		else if (i >= 0x200 && i < 0x200 + this.program.length)
			type = "program";
		else
			type = "memory"
		buf+= "<span class='" + type + "'>" + hex(mem[i]) + " </span>";
	}
	return buf + "\n";
}

chip8.prototype.dump_memory = function() {
	var buf = "";
	buf += "<span class='head'>pc: </span><span class='pc'>" + hex(this.pc) + "</span>\n";
	buf += "<span class='head'>opcode: </span><span class='pc'>" + hex(this.opcode) + "</span>\n";
	buf += "<span class='head'>I: </span><span class='pc'>" + hex(this.I) + "</span>\n";
	buf += "<span class='head'>sp: </span><span class='pc'>" + hex(this.sp) + "</span>\n";
	buf += "<span class='head'>V: </span>" + this.d(this.V);
	buf += "<span class='head'>S: </span>" + this.d(this.S);
	buf += "<span class='head'>M: </span>" + this.d(this.M);
	document.getElementById("memory").innerHTML = buf;
	
}

chip8.prototype.run = function() {
	if (this.pc > 0xfff) {
		return;
	}
	var op = this.opcode = this.M[this.pc] << 8 | this.M[this.pc + 1];
	switch (op & 0xF000) {
		case 0x6000: // Sets VX to NN.
			console.log(
				hex(op),
				"Set V",
				(op & 0xf00) >> 8,
				"TO",
				hex(op & 0xff)
			);
			this.V[(op & 0xf00) >> 8] = op & 0xff;
			break
		case 0xa000: // Sets I to the address NNN.
			console.log(
				hex(op),
				"Set I TO",
				hex(op & 0xfff)
			);
			this.I = op & 0xfff;
			break
		default:
			console.log("Bad op: " + hex(op));
			this.pc = 0xf000;
			return

	}

	this.pc += 2;
}


	

chip8.prototype.fontset = new Uint8Array(
[ 
  0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
  0x20, 0x60, 0x20, 0x20, 0x70, // 1
  0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
  0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
  0x90, 0x90, 0xF0, 0x10, 0x10, // 4
  0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
  0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
  0xF0, 0x10, 0x20, 0x40, 0x40, // 7
  0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
  0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
  0xF0, 0x90, 0xF0, 0x90, 0x90, // A
  0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
  0xF0, 0x80, 0x80, 0x80, 0xF0, // C
  0xE0, 0x90, 0x90, 0x90, 0xE0, // D
  0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
  0xF0, 0x80, 0xF0, 0x80, 0x80  // F
]);
