const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp(functions.config().firebase);

// New cloud-tts document is created
exports.cloudTTS = functions.firestore
  .document('createTTS/{docId}').onCreate((snap, context) => {

    if (!snap.data().tts) {return null;}
    return createTTS(snap);
});

function createTTS (documentSnapshot) {
  
  // Set the request objects to the "tts" object of the document snapshot
  // input: {text: text}
  let {
    input,
    voice = {
      languageCode: 'en-GB',
      name: 'en-GB-Wavenet-A'
    },
    audioConfig = {
      audioEncoding: 'MP3',
      effectsProfileId: 'large-home-entertainment-class-device'
    }
  } = documentSnapshot.data().tts;

  // Check if this needs translating
  if (voice.languageCode !== 'en-GB') {
    // Translate the text, create the output and then write back to Cloud Firestore
    console.log(`Sending to Translate: ${input.text} with languageCode ${voice.languageCode.substring(0,2)}`);

    // Lazy load the client libraries
    const {Translate} = require('@google-cloud/translate');
    const translate = new Translate();

    return translate.translate (input.text, voice.languageCode.substring(0,2))
    .then((response) => {
      input.beforeText = tts.input.text;
      input.text = response[0];
      return createTTSOutput ({input, voice, audioConfig});
    })
    .then((audioContent) => {
      return writeTTSData (documentSnapshot, {input, voice, audioConfig, audioContent});
    });
  } else {
    // Create the output and then write back to Cloud Firestore
    return createTTSOutput ({input, voice, audioConfig})
    .then((audioContent) => {
      return writeTTSData (documentSnapshot, {input, voice, audioConfig, audioContent});
    });
  }
}

// Create the TTS output
function createTTSOutput (request) {
  return new Promise( function(resolve, reject) {

    // Lazy load the client libraries
    const textToSpeech = require('@google-cloud/text-to-speech');
    const client = new textToSpeech.TextToSpeechClient();
    
    // Performs the Text-to-Speech request
    return client.synthesizeSpeech(request, (err, response) => {
      if (err) {
        console.error('ERROR:', err);
        reject(err);
      } else {
        console.log(`${scriptVersion} - ${JSON.stringify(response).substring(0,20)}`);
        resolve(response.audioContent);
      }
    });
  });
}

// Write the TTS output data back to Cloud Firestore and Cloud Storage
function writeTTSData (documentSnapshot, tts) {

  return documentSnapshot.ref.update({tts})
  .then(() => {
  	const bucket = admin.storage().bucket();
  	const filename = `${documentSnapshot.id}.mp3`;
  	const file = bucket.file(filename);
  
  	let buff = Buffer.from(tts.audioContent, 'binary'); //.toString('utf-8');
  
  	const stream = file.createWriteStream({
  		metadata: {
  			contentType: 'audio/mpeg'
  		}
  	});
  	stream.on('error', (err) => {
  		return(err);
  	});
  	stream.on('finish', () => {
  		console.log(filename);
      return(true);
  	});
  	stream.end(new Buffer(buff, 'base64'));
  	return true;
  })
  .catch((err) => {
    return(err);
  });
}