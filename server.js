"use strict";

process.title = 'Chat Server with Node.js';
process.on('uncaughtException', function (err)
{
    log.debug( "ERROR: " + err.stack);
    console.error( err.stack);
});

// Port where we'll run the websocket server
var webSocketsServerPort = 1337;

var fs = require('fs')
    , Log = require('log')
    , log = new Log('debug', fs.createWriteStream('serverChat.log'));

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
        var msg = {
            cmd: "userleft",
            message: nickname + " has left " + channel.name,
            channel: channel.name,
            nickname: nickname,
            time: (new Date()).getTime()
        }

        sendToAll( channel.name, JSON.stringify( msg));
    }
}

function storeNickName( connection, nickname)
{
    log.debug( "Store nickname " + nickname);
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
        log.debug( "Connection not found to store nickname.");
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
    log.debug( "join channel " + channel + " nickname: " + nickname);
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
        log.debug( msg);
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
    log.debug( "Validate nickname " + nickname);
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
    log.debug( "Remove client " + username);
    var index = getClientIndexByNickname( username);
    log.debug( "Remove client index " + index);
    clients = remove( clients, index);
}

function sendParticipants( userName, channel)
{
    log.debug( "Send participants from channel " + channel + " to username: " + userName);
    var ch = getChannel( channel);
    var participants = [];
    for( var i = 0; i < ch.participants.length; i++)
    {
        var participant = {
            nickname: ch.participants[i].val
        }
        participants.push( participant);
    }
    var msg = {
        cmd: "participants",
        participants: participants,
        channel: channel
    }

    var obj = JSON.stringify( msg);
    sendToParticipant( userName, obj);
}

function sendToParticipant( username, message)
{
    var client = getClientByNickname( username);
    if ( client != null)
    {
        client.sendUTF( message);
    }
}
/**
 * HTTP server
 */
var server = http.createServer(function(request, response) {
    // Not important for us. We're writing WebSocket server, not HTTP server
});
server.listen(webSocketsServerPort, function() {
    log.debug( "Server is listening on port " + webSocketsServerPort);
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
    log.debug( ' Connection from origin ' + request.origin + '.');

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
    clients.push( client);
    var userName = false;
    log.debug( 'Connection accepted.');

    // user sent some message
    connection.on('message', function(message) {

        if (message.type === 'utf8') { // accept only text
            log.debug( "Message from client: " + message.utf8Data);

            var msg = JSON.parse( message.utf8Data);
            var cmd = msg.cmd.toLowerCase();
            var arg = msg.args;

            if ( cmd == "setnick")
            {
                log.debug( "setnick command");
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
                log.debug( "sendmessage command");
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
                log.debug( "joinchannel command");
                userName = identifyNickname(this);
                var channel = arg;
                joinChannel( channel, userName);
                var obj = {
                    cmd: 'userjoin',
                    message: userName + ' joined',
                    channel: channel,
                    nickname: userName,
                    time: (new Date()).getTime()
                };
                var obj2 = JSON.stringify( obj);
                // send back chat history
                var ch = getChannel( channel);
                if ( ch.history != null && ch.history.length > 0)
                {
                 connection.sendUTF(JSON.stringify( { cmd: 'history', data: ch.history, channel: channel} ));
                }
                sendParticipants( userName, channel);
                sendToAll( channel, obj2);
            }
            else if ( cmd = "getparticipants")
            {
                userName = identifyNickname(this);
                sendParticipants( userName, arg);
            }
        }
    });

    // user disconnected
    connection.on('close', function(connection)
    {
        log.debug( " Peer " + connection.remoteAddress + " disconnected.");
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