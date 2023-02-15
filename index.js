const AllPeerConnections = {};

const SOCKET_RECEIVE_EVENTS = {
  INVALID_TOKEN: "INVALID_TOKEN",
  EMPTY_ROOM: "EMPTY_ROOM",
  REQUEST_OFFER: "REQUEST_OFFER",
  REQUEST_ANSWER: "REQUEST_ANSWER",
  ANSWER_OF_OFFER: "ANSWER_OF_OFFER",
};

const SOCKET_SEND_EVENTS = {
  WEBRTC_OFFER: "WEBRTC_OFFER",
  WEBRTC_ANSWER: "WEBRTC_ANSWER",
};

function checkPage() {
  if (window.location.pathname === "") {
    alert("Append your identifier in URL");
    return false;
  } else if (window.location.pathname.substring(1).indexOf("/") !== -1) {
    alert("Append correct identifier in URL");
    return false;
  }
  return true;
}

function startConnection() {
  if (!"WebSocket" in window) {
    alert("WebSocket not supported");
    return;
  }
  if (!"RTCPeerConnection" in window) {
    alert("WebRTC not supported");
    return;
  }

  // socket io
  const socket = io("localhost:8080", {
    transports: ["websocket"],
    auth: {
      token: window.location.pathname.substring(1),
    },
  });

  socket.on("connect", () => {
    console.log("My Socket id in signalling server ", socket.id);
  });

  socket.on(SOCKET_RECEIVE_EVENTS.EMPTY_ROOM, () => {
    console.log("No other clients to sync with");
  });

  socket.on(SOCKET_RECEIVE_EVENTS.REQUEST_OFFER, (payload) => {
    console.log(
      "Received request to create offer for ",
      payload.existingClients.join()
    );
    payload.existingClients.forEach(async (clientId) => {
      let peerConnection = createNewPeerConnection(clientId);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit(SOCKET_SEND_EVENTS.WEBRTC_OFFER, {
        remoteClient: clientId,
        offer: offer,
      });
      console.log("Offer created and sent for ", clientId);
    });
  });

  socket.on(
    SOCKET_RECEIVE_EVENTS.REQUEST_ANSWER,
    async ({ initiatingClient, offer }) => {
      console.log("Received request to create answer for ", initiatingClient);
      let peerConnection = createNewPeerConnection(initiatingClient);
      peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit(SOCKET_SEND_EVENTS.WEBRTC_ANSWER, {
        initiatingClient,
        answer,
      });
      console.log("Answer created and sent for ", initiatingClient);
    }
  );

  socket.on(
    SOCKET_RECEIVE_EVENTS.ANSWER_OF_OFFER,
    ({ remoteClient, answer }) => {
      console.log("Received answer from ", remoteClient);
      AllPeerConnections[remoteClient].peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    }
  );
}

if (checkPage()) {
  startConnection();
}

function createNewPeerConnection(peerId) {
  let peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
    ],
  });
  AllPeerConnections[peerId] = { peerConnection };
  return peerConnection;
}
