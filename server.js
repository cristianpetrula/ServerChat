"use strict";

process.title = 'Chat Server with Node.js';

// Port where we'll run the websocket server
var webSocketsServerPort = 1337;

// websocket and http servers
var webSocketServer = require('websocket').server;
var http = require('http');

/**
 * Global variables
 */
// list of currently connected clients (users)
var clients = [ ];
var channels = [ ];

function remove( array, index)
{
    var result = [];
    for( var i = 0; i < array.length; i++)
    {
        if ( i != index)
        {
            result.push( array[i]);
        }
    }
    return result;
}
function getClientByNickname( nickname)
{
    for (var i=0; i < clients.length; i++)
    {
        if ( clients[i].nick.toLowerCase() == nickname.toLowerCase())
        {
            return clients[i].conn;
        }
    }
}

function getClientIndexByNickname( nickname)
{
    for (var i=0; i < clients.length; i++)
    {
        if ( clients[i].nick.toLowerCase() == nickname.toLowerCase())
        {
            return i;
        }
    }
}
/**
 * Helper function for escaping input strings
 */
function sendToAll(channel, message) {
    if ( message != null && channel != null)
    {
        var ch = getChannel( channel);
        var participants = ch.participants;

        for (var i=0; i < participants.length; i++)
        {
            var participant = participants[i];
            var connection = getClientByNickname( participant.val);
            if (connection != null)
            {
                connection.sendUTF(message);
            }
        }
    }
}

function addToHistory(message, author, channelName)
{
    // we want to keep history of all sent messages
    var obj = {
        time: (new Date()).getTime(),
        text: message,
        author: author
    };
    var channel = getChannel( channelName);
    if ( channel != null && channel.history != null)
    {
        channel.history.push( obj);
        channel.history = channel.history.slice(-100);
    }
}

function getChannel( channelName)
{
    for (var i=0; i < channels.length; i++)
    {
        if ( channels[i].name.toLowerCase() == channelName.toLowerCase())
        {
            return channels[i];
        }
    }
}

function leaveChannels( nickname)
{
    for (var i=0; i < channels.length; i++)
    {
        leaveChannel( channels[i], nickname);
    }
}

function leaveChannel( channel, nickname)
{
    var participants = channel.participants;
    var pos = -1;
    for (var i = 0; i < participants.length; i++)
    {
        if ( participants[i].val.toLowerCase() == nickname.toLowerCase())
        {
            pos = i;
        }
    }
    if ( pos != -1)
    {
        channel.participants = remove( channel.participants, pos);
        sendToAll( channel, nickname + " has left " + channel.name);
    }
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
        console.log("Connection not found.");
    }
}
function checkIfParticipantExists( participants, nickname)
{
    for( var i = 0; i < participants.length; i++)
    {
        if ( participants[i].val.toLowerCase() == nickname.toLowerCase())
        {
            return true;
        }
    }
    return false;
}
function joinChannel(channel, nickname)
{
    var found = false;
    for (var i=0; i < channels.length; i++)
    {
        if ( channels[i].name.toLowerCase() == channel.toLowerCase())
        {
            var participants = channels[i].participants;
            if ( !checkIfParticipantExists( participants, nickname))
            {
                var participant = {
                    val: nickname
                };
                participants.push( participant);
            }
            found = true;
        }
    }
    if (!found)
    {
        var participant = {
            val: nickname
        };
        var participants = [];
        participants.push( participant);
        var history = [];
        var msg = "Channel " + channel + " was created by " + nickname;
        var obj = {
            time: (new Date()).getTime(),
            text: msg
        };
        history.push( obj);

        var channel = {
            name: channel,
            participants: participants,
            history: history
        };
        channels.push( channel);
    }
}

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

function validateNick( nickname)
{
    if ( nickname == null)
    {
        return false;
    }
    else
    {
        for( var i = 0; i < clients.length; i++)
        {
            if ( clients[ i].nick.toLowerCase() == nickname.toLowerCase())
            {
                return false;
            }
        }
    }
    return true;
}

function removeClient( username)
{
    var index = getClientIndexByNickname( username);
    clients = remove( clients, index);
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
                if ( validateNick(userName))
                {
                    storeNickName( this, userName);
                    var obj = {
                        cmd: 'nicknameaccepted',
                        time: (new Date()).getTime()
                    };
                    var obj2 = JSON.stringify( obj);
                    this.sendUTF( obj2);
                }
                else
                {
                    var mesg = "Invalid username: " + userName + ". Try something else.";
                    var obj = {
                        cmd: 'invalidnickname',
                        message: mesg,
                        time: (new Date()).getTime()
                    };
                    var obj2 = JSON.stringify( obj);
                    this.sendUTF( obj2);
                }
            }
            else if ( cmd == "sendmessage")
            {
                userName = identifyNickname(this);
                ch = msg.channel;
                var obj = {
                    cmd: 'newmessage',
                    message: arg,
                    nickname: userName,
                    channel: ch,
                    time: (new Date()).getTime()
                };
                addToHistory( arg, userName, ch);
                var obj2 = JSON.stringify( obj);
                sendToAll( ch, obj2);
            }
            else if ( cmd == "joinchannel")
            {
                userName = identifyNickname(this);
                var channel = arg;
                joinChannel( channel, userName);
                var obj = {
                    cmd: 'newmessage',
                    message: userName + ' joined',
                    channel: channel,
                    time: (new Date()).getTime()
                };
                var obj2 = JSON.stringify( obj);
                // send back chat history
                var ch = getChannel( channel);
                if ( ch.history != null && ch.history.length > 0)
                {
                 connection.sendUTF(JSON.stringify( { cmd: 'history', data: ch.history, channel: channel} ));
                }
                sendToAll( channel, obj2);
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
        removeClient( userName);
        leaveChannels( userName);
    });

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