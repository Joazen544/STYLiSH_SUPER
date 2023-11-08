const WebSocketServer = require("ws").Server;
const ws = new WebSocketServer({ port: 8895 });
const fs = require("fs");

const user = {};

ws.on("listening", function () {
  console.log("Socket server started with port 8895");
});

ws.on("connection", function (connection) {
  if (user["offer"]) {
    user["offer"].send("a new user login");
  } else {
    connection.send("no offer exist");
  }
  //connection.send("Hello from server");

  /* Action to do when user send messages */

  connection.on("message", function message(data, isBinary) {
    const message = data.toString();
    const RTCsession = JSON.parse(message);
    const type = RTCsession.payload.type;

    if (type == "offer") {
      user["offer"] = connection;
      fs.writeFileSync("offerSDP.txt", message);
      console.log("offer connected");
    } else if (type == "answer" && user["offer"]) {
      const offerSDP = fs.readFileSync("offerSDP.txt", "utf8");
      connection.send(offerSDP);
      user["offer"].send(message);
    }
    //const obj = JSON.parse(message);
    //console.log(obj.title);
    //console.log(message);
  });

  /* Action to do When user try to close the connection */
  connection.on("close", function () {
    console.log("Disconnecting user");
  });
});
