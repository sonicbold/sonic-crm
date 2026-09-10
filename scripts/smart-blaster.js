const fs = require('fs');

/**
 * Placeholder function for sending SMS.
 * You can plug in Twilio, GoHighLevel, or any SMS API here.
 */
async function send_sms(phone, message) {
  // Example of how you would plug in an API:
  // await fetch('https://api.sms-provider.com/send', { method: 'POST', body: JSON.stringify({ phone, message }) });
  
  // For now, we simulate network delay of 200-500ms
  await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
  
  // Simulate a 5% chance of API failure to demonstrate error handling
  if (Math.random() < 0.05) throw new Error("API Rate Limit or Invalid Number");
  
  return { success: true };
}

// Helper to delay execution
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runCampaign(contacts, targetHours, messageTemplate) {
  const totalContacts = contacts.length;
  if (totalContacts === 0) {
    console.log("No contacts provided!");
    return;
  }

  // Auto-Calculate Base Delay (in seconds)
  const baseDelaySeconds = (targetHours * 3600) / totalContacts;
  
  console.log(`\n🚀 Starting Organic SMS Blast`);
  console.log(`================================`);
  console.log(`Total Contacts: ${totalContacts}`);
  console.log(`Target Duration: ${targetHours} hours`);
  console.log(`Base Delay between SMS: ${baseDelaySeconds.toFixed(1)} seconds\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < totalContacts; i++) {
    const contact = contacts[i];
    
    // Personalize message (replace {name} placeholder)
    const message = messageTemplate.replace(/{name}/g, contact.name || "there");
    
    try {
      await send_sms(contact.phone, message);
      successCount++;
      process.stdout.write(`✅ [${i + 1}/${totalContacts}] Sent to ${contact.phone} `);
    } catch (error) {
      failCount++;
      process.stdout.write(`❌ [${i + 1}/${totalContacts}] Failed for ${contact.phone} (${error.message}) `);
    }

    // If this is the last contact, no need to wait
    if (i === totalContacts - 1) break;

    // Calculate Random Jitter (70% to 130%)
    let minDelay = baseDelaySeconds * 0.7;
    let maxDelay = baseDelaySeconds * 1.3;
    
    // Ensure minimum delay is at least 2 seconds
    minDelay = Math.max(2, minDelay);
    maxDelay = Math.max(2, maxDelay);

    const jitterDelaySeconds = minDelay + Math.random() * (maxDelay - minDelay);
    
    console.log(`| Next in ${jitterDelaySeconds.toFixed(1)} seconds...`);
    await sleep(jitterDelaySeconds * 1000);
  }

  console.log(`\n\n🎉 Campaign Complete!`);
  console.log(`Successfully sent: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

// ==========================================
// HOW TO USE THE SCRIPT
// ==========================================

// 1. Define your target duration in hours
const TARGET_HOURS = 2; // e.g., Spread the blast over 2 hours

// 2. Define your message template
const MESSAGE = "Hi {name}, Sonic CRM is running a special this month. Are you interested?";

// 3. Provide your contacts
// (You could read these from a CSV using the 'csv-parser' package or fs.readFileSync)
const MY_CONTACTS = [
  { phone: "+15550001111", name: "Mike" },
  { phone: "+15550002222", name: "Sarah" },
  { phone: "+15550003333", name: "John" },
  { phone: "+15550004444", name: "Emma" },
  { phone: "+15550005555", name: "David" },
];

// Run the function
runCampaign(MY_CONTACTS, TARGET_HOURS, MESSAGE);
