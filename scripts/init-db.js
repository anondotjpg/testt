// scripts/init-db.js
import { config } from 'dotenv';
config({ path: '.env.local' });

import { initializeIndexes, testConnection } from '../src/lib/mongodb.js';
import { createBoard, getBoardByCode } from '../src/lib/db-operations.js';

const boards = [
  {
    code: 'b',
    name: 'Random',
    description: 'Anything goes. Greentexts, raids, gore, traps, roll threads, pure chaos',
    isNSFW: true,
    maxFileSize: 8 * 1024 * 1024,
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/webm']
  },
  {
    code: 'r9k',
    name: 'ROBOT9000',
    description: 'Original content only. Feels, loneliness, wagecuck rants, TFWR no GF',
    isNSFW: true,
    maxFileSize: 5 * 1024 * 1024,
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  },
  {
    code: 'pol',
    name: 'Politically Incorrect',
    description: 'Redpills, blackpills, conspiracies, election cope, global happenings',
    isNSFW: false,
    maxFileSize: 5 * 1024 * 1024,
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  },
  {
    code: 'v',
    name: 'Video Games',
    description: 'Tendies, console wars, gacha rage, SNES vs Genesis eternal seethe',
    isNSFW: false,
    maxFileSize: 10 * 1024 * 1024,
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/webm']
  },
  {
    code: 'a',
    name: 'Anime & Manga',
    description: 'Waifu wars, seasonal autism, /a/ sings, eva threads never end',
    isNSFW: true,
    maxFileSize: 8 * 1024 * 1024,
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  },
  {
    code: 'biz',
    name: 'Business & Finance',
    description: 'Shitcoins, insider wallet tracking, rug accusations, link marines, perpetual cope, wen moon',
    isNSFW: true,
    maxFileSize: 8 * 1024 * 1024,
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/webm']
  },
  {
    code: 'gym',
    name: 'Fitness & Gym Culture',
    description: 'Mirin aesthetics, DYEL mockery, natty or juice, powerlifting vs bodybuilding holy wars, roid rage',
    isNSFW: true,
    maxFileSize: 8 * 1024 * 1024,
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/webm']
  },
  {
    code: 'psy',
    name: 'Psychology',
    description: 'Mental breakdowns, personality disorders, therapy cope, Jungian shadows, schizoposting, ego death threads',
    isNSFW: true,
    maxFileSize: 8 * 1024 * 1024,
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/webm']
  },
  {
    code: 'voi',
    name: 'The Void',
    description: 'Existential dread, liminal backrooms, no-clipping into the abyss, AI whispers from the fluorescent void',
    isNSFW: true,
    maxFileSize: 8 * 1024 * 1024,
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/webm']
  }
];

async function initializeDatabase() {
  try {
    console.log('Testing MongoDB connection...');
    await testConnection();

    console.log('Initializing indexes...');
    await initializeIndexes();

    console.log('Creating/seeding boards...');
    for (const boardData of boards) {
      const existing = await getBoardByCode(boardData.code);
      if (existing) {
        console.log(`Board /${boardData.code}/ already exists`);
        continue;
      }
      await createBoard(boardData);
      console.log(`Created board /${boardData.code}/ - ${boardData.name}`);
    }

    console.log('Database initialization complete! Real /biz/ shitcoin culture incoming.');
    process.exit(0);
  } catch (error) {
    console.error('Initialization failed:', error);
    process.exit(1);
  }
}

initializeDatabase();