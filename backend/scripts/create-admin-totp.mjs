// Run on your own computer. Never commit or share this command's output.
import {randomBytes} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
const terminal=createInterface({input:process.stdin,output:process.stdout});
try{
 const username=(await terminal.question('Admin username (or owner email): ')).trim().toLowerCase();
 if(!username)throw Error('Username is required');
 const bytes=randomBytes(20),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0,secret='';
 for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;secret+=alphabet[(value>>>bits)&31]}}
 if(bits)secret+=alphabet[(value<<(5-bits))&31];
 console.log('First add this key to your authenticator (TOTP, 6 digits, 30 seconds):');console.log(secret);
 console.log('Then merge this JSON into ADMIN_TOTP_SECRETS in Liara:');console.log(JSON.stringify({[username]:secret}));
 console.log('Keep an offline copy securely. Never commit or send the secret to anyone.');
}finally{terminal.close()}
