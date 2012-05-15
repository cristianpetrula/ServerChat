// http://ejohn.org/blog/ecmascript-5-strict-mode-json-and-more/
"use strict";

// Optional. You will see this name in eg. 'ps' or 'top' command
process.title = 'node-chat';

// Port where we'll run the websocket server
var webSocketsServerPort = 1337;

// websocket and http servers
var webSocketServer = require('websocket').server;
var http = require('http');

/**
 * Global variables
 */
// latest 100 messages
var history = [ ];
// list of currently connected clients (users)
var clients = [ ];

/**
 * Helper function for escaping input strings
 */
function sendToAll(message) {
    if ( message != null)
    {
        for (var i=0; i < clients.length; i++)
        {
            clients[i].conn.sendUTF(message);
        }
    }
}

function addToHistory(message, author)
{
    // we want to keep history of all sent messages
    var obj = {
        time: (new Date()).getTime(),
        text: message,
        author: author
    };
    history.push(obj);
    history = history.slice(-100);
}

/**
 * HTTP server
 */
var server = http.createServer(function(request, response) {
    // Not important for us. We're writing WebSocket server, not HTTP server
});
server.listen(webSocketsServerPort, function() {
    console.log((new Date()) + " Server is listening on port " + webSocketsServerPort);
});

/**
 * WebSocket server
 */
var wsServer = new webSocketServer({
    // WebSocket server is tied to a HTTP server. To be honest I don't understand why.
    httpServer: server
});

// This callback function is called every time someone
// tries to connect to the WebSocket server
wsServer.on('request', function(request) {
    console.log((new Date()) + ' Connection from origin ' + request.origin + '.');

    // accept connection - you should check 'request.origin' to make sure that
    // client is connecting from your website
    // (http://en.wikipedia.org/wiki/Same_origin_policy)
    var connection = request.accept(null, request.origin);
    var token = randomString(64);
    // we need to know client index to remove them on 'close' event
    var client =
    {
        conn : connection,
        token : token,
        nick : ''
    }
    var index = clients.push(client) - 1;
    var userName = false;

    console.log((new Date()) + ' Connection accepted.');

    // user sent some message
    connection.on('message', function(message) {

        if (message.type === 'utf8') { // accept only text
            console.log("Message from client: " + message.utf8Data + "\n");

            var msg = JSON.parse( message.utf8Data);
            var cmd = msg.cmd;
            var arg = msg.args;

            if ( cmd == "setnick")
            {
                userName = arg;
                storeNickName( this, userName);
                // send back chat history
                if (history.length > 0) {
                    connection.sendUTF(JSON.stringify( { cmd: 'history', data: history} ));
                }
                 var obj = {
                    cmd: 'newmessage',
                    message: userName + ' joined',
                    time: (new Date()).getTime()
                };
                var obj2 = JSON.stringify( obj);
                sendToAll( obj2);

            }
            else if ( cmd = "sendmessange")
            {
                userName = identifyNickname(this);
                var obj = {
                    cmd: 'newmessage',
                    message: arg,
                    nickname: userName,
                    time: (new Date()).getTime()
                };
                addToHistory( arg, userName);
                var obj2 = JSON.stringify( obj);
                sendToAll( obj2);
            }
        }
    });

    // user disconnected
    connection.on('close', function(connection)
    {
        console.log((new Date()) + " Peer "
            + connection.remoteAddress + " disconnected.");
        // remove user from the list of connected clients
        userName = identifyNickname(this);
        var obj = {
            cmd: 'newmessage',
            message: userName + " disconnected",
            time: (new Date()).getTime()
        };
        sendToAll( JSON.stringify( obj));
        clients.splice(index, 1);
    });

    function randomString(bits)
    {
        var chars,rand,i,ret

        chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

        ret=''

        // in v8, Math.random() yields 32 pseudo-random bits (in spidermonkey it gives 53)

        while(bits > 0){

            rand=Math.floor(Math.random()*0x100000000) // 32-bit integer

            // base 64 means 6 bits per character, so we use the top 30 bits from rand to give 30/6=5 characters.

            for(i=26; i>0 && bits>0; i-=6, bits-=6) ret+=chars[0x3F & rand >>> i]}

        return ret
    }

    function storeNickName( connection, nickname)
    {
        var found = false;
        for (var i=0; i < clients.length; i++)
        {
            if ( clients[i].conn == connection)
            {
                clients[i].nick = nickname;
                found = true;
            }
        }
        if ( !found)
        {
            console.out("Connection not found.");
        }
    }

    function identifyNickname( connection)
    {
        for (var i=0; i < clients.length; i++)
        {
            if ( clients[i].conn == connection)
            {
                return clients[i].nick;
            }
        }
    }
});