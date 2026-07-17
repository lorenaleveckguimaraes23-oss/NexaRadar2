chrome.runtime.onInstalled.addListener(()=>console.log("Nexa Radar 2.1.1 iniciado."));
chrome.runtime.onMessage.addListener((r,s,sendResponse)=>{if(r.action==="PING")sendResponse({status:"online",message:"Nexa Radar funcionando."});return false;});
