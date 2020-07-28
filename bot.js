console.log("Starting bots");

const { spawn } = require('child_process');


const lib = require('./lib.js');
const fs = require("fs");
const Mutex = require('async-mutex').Mutex;

var process_descriptors = [];
var processes = {};

log_mutex = new Mutex();

process_descriptors.push({command: ['botv3.js'], name: "MirriBot"});

var dbot_args = ['dbot.js'];
if (process.argv[2] != 1) dbot_args.push('restart');
process_descriptors.push({command: dbot_args, name: "dbot"}); 

for (p of process_descriptors) {
    createProc(p)
}


function createProc(process_descriptor) {
    var proc = spawn('node', process_descriptor.command);
    processes[process_descriptor.name] = proc;
    proc.stdout.on('data', (data) => {
        process.stdout.write("[" + process_descriptor.name + "]: " + data);
    });
    proc.stderr.on('data', (data) => {
        if (isExperimentalWarning(data.toString())) return;
        process.stdout.write("[Error in " + process_descriptor.name + "]: " + data);
        log_err(process_descriptor.name, data);
    });
    proc.on('exit', (code, signal) => {
        process.stdout.write(process_descriptor.name + " has exited with code " + code + " and signal " + signal + ", restarting it now.\n");
        if (code !== 0) {
            log_err(process_descriptor.name, code, signal);
        }
        createProc(process_descriptor);
    });
}

function isExperimentalWarning(err) {
    return err.includes("ExperimentalWarning:");
}

async function log_err(name, err, signal) {    
  var d = new Date()
  var format_d = d.toLocaleString();
  const release = await log_mutex.acquire(); 
  var s = "";
  
  if (signal === undefined) s = "[" + name + " error] " + format_d + " - " + err + "\n";
  else s = "[" + name + " shutdown] " + format_d + " - " + name + " has exited with code " + err + ".\n";
  fs.appendFileSync("err_log.txt", s);
  release();
}

(async () => { 
    const async_reader = new lib.asyncReader()
    var running = true;
    var stdin;
    var p_name = "use -t to set target process";
    while(running) {
        var msg = await async_reader.readLineAsync();
        var input = msg.split(" ");
        var command = input[0];
        if (command == "-t") {
            var target = input[1]
            if (input.length == 1) {
                console.log("Target process is " + p_name)
            } else {
                if (target in processes) {
                    stdin = processes[target].stdin;
                } else if (parseInt(target) < Object.keys(processes).length) {
                    target = Object.keys(processes)[parseInt(target)]
                    stdin = processes[target].stdin
                } else {
                    console.log("Process not found, available processes:", Object.keys(processes))
                    continue;
                }
                console.log("Set target process to " + target)
                p_name = target;
            }
        } else {
            if (stdin != undefined) {
                stdin.write(msg + "\n");
            } else { 
                console.log("Set a target process with -t first")
            }
        }
    }
})();