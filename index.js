const AllPeerConnections = {};
let mySocket;

const SOCKET_RECEIVE_EVENTS = {
  INVALID_TOKEN: "INVALID_TOKEN",
  EMPTY_ROOM: "EMPTY_ROOM",
  REQUEST_OFFER: "REQUEST_OFFER",
  REQUEST_ANSWER: "REQUEST_ANSWER",
  ANSWER_OF_OFFER: "ANSWER_OF_OFFER",
  NEW_ICE_CANDIDATES: "NEW_ICE_CANDIDATES",
};

const SOCKET_SEND_EVENTS = {
  WEBRTC_OFFER: "WEBRTC_OFFER",
  WEBRTC_ANSWER: "WEBRTC_ANSWER",
  NEW_ICE_CANDIDATES: "NEW_ICE_CANDIDATES",
};

function checkPage() {
  if (window.location.pathname === "/") {
    window.location.href = Date.now();
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
    mySocket = socket;
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
      let peerConnection = createNewPeerConnection(initiatingClient, false);
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

  socket.on(
    SOCKET_RECEIVE_EVENTS.NEW_ICE_CANDIDATES,
    async ({ peerId, iceCandidates }) => {
      console.log("Received new ice candidates from ", peerId);
      try {
        iceCandidates.forEach((ice) =>
          AllPeerConnections[peerId].peerConnection.addIceCandidate(ice)
        );
      } catch (e) {
        console.error(
          "Error adding received ice candidate for ",
          peerId,
          " - ",
          e
        );
      }
    }
  );
}

if (checkPage()) {
  startConnection();
}

function createNewPeerConnection(peerId, isInitiatingPeer = true) {
  let peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
    ],
  });

  AllPeerConnections[peerId] = {
    peerConnection,
    canSendIceCandidates: false,
    iceCandidates: [],
  };
  // handling data channel
  if (isInitiatingPeer) {
    const dataChannel = peerConnection.createDataChannel(
      `DataChannel_${peerId}`
    );
    console.log("Creating DataChannel ", dataChannel.label);
    dataChannel.onopen = () => console.log(`DataChannel_${peerId} opened`);
    dataChannel.onclose = () => console.log(`DataChannel_${peerId} closed`);
    dataChannel.onmessage = (event) => onTextUpdate(event.data);
    AllPeerConnections[peerId].dataChannel = dataChannel;
  } else {
    peerConnection.ondatachannel = (event) => {
      const dataChannel = event.channel;
      console.log("Created DataChannel by remote end ", dataChannel.label);
      dataChannel.onopen = () => console.log(`DataChannel_${peerId} opened`);
      dataChannel.onclose = () => console.log(`DataChannel_${peerId} closed`);
      dataChannel.onmessage = (event) => onTextUpdate(event.data);
      AllPeerConnections[peerId].dataChannel = dataChannel;
    };
  }

  peerConnection.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      console.log(" newly found ice-candidate for ", peerId);
      AllPeerConnections[peerId].iceCandidates.push(event.candidate);
      if (AllPeerConnections[peerId].canSendIceCandidates) {
        sendUpdatedIceCandidates(peerId);
      }
    }
  });

  peerConnection.addEventListener("signalingstatechange", (event) => {
    if (peerConnection.signalingState === "stable") {
      AllPeerConnections[peerId].canSendIceCandidates = true;
      sendUpdatedIceCandidates(peerId);
    }
  });

  peerConnection.addEventListener("connectionstatechange", (event) => {
    if (peerConnection.connectionState === "connected") {
      console.log("! Connected with ", peerId);
    }
  });
  return peerConnection;
}

function sendUpdatedIceCandidates(peerId) {
  if (AllPeerConnections[peerId].iceCandidates.length === 0) return;
  console.log("Sending new ice candidates to ", peerId);
  mySocket.emit(SOCKET_SEND_EVENTS.NEW_ICE_CANDIDATES, {
    peerId,
    iceCandidates: AllPeerConnections[peerId].iceCandidates,
  });
  AllPeerConnections[peerId].iceCandidates = [];
}

function onTextUpdate(newText) {
  console.log("Updated text - ", newText);
  document.querySelector(".textArea").value = newText;
}

document.querySelector(".clickBtn").addEventListener("click", () => {
  const text = document.querySelector(".textArea").value;
  Object.values(AllPeerConnections).forEach(({ dataChannel }) => {
    if (dataChannel.readyState === "open") {
      dataChannel.send(text);
    }
  });
});
