'use strict';
// Mascota tipo Tamagotchi. Pierde hambre y ánimo despacito con el tiempo (nunca se muere).
// Se calcula "perezosamente": cada vez que alguien la mira se descuenta lo que pasó desde la última vez.

const PET_KINDS = ['perrito', 'gatito', 'pollito', 'slime'];
const SHOP = {
  galletita: { label: 'Galletita', emoji: '🍪', price: 10, hunger: 20, happy: 0 },
  pizza: { label: 'Pizza', emoji: '🍕', price: 25, hunger: 50, happy: 5 },
  torta: { label: 'Torta', emoji: '🎂', price: 60, hunger: 100, happy: 20 },
  pelota: { label: 'Pelota', emoji: '⚽', price: 20, hunger: 0, happy: 35 },
};
const DECAY_PER_HOUR = { hunger: 4, happy: 3 }; // de 100 a 0 en ~25 h y ~33 h
const PET_COOLDOWN_MS = 60e3;
const PET_HAPPY = 8;

const clamp = (v) => Math.max(0, Math.min(100, v));
const round1 = (v) => Math.round(v * 10) / 10;

function newPet(now) {
  return { kind: 'perrito', name: '', hunger: 80, happy: 80, t: now, lastPet: 0 };
}

function tick(pet, now) {
  const hours = (now - pet.t) / 3600e3;
  if (hours > 0) {
    pet.hunger = round1(clamp(pet.hunger - DECAY_PER_HOUR.hunger * hours));
    pet.happy = round1(clamp(pet.happy - DECAY_PER_HOUR.happy * hours));
    pet.t = now;
  }
  return pet;
}

function buy(user, itemId, now) {
  const item = SHOP[itemId];
  if (!item) return { ok: false, error: 'Ese producto no existe' };
  if (user.coins < item.price) return { ok: false, error: `Te faltan ${item.price - user.coins} monedas` };
  tick(user.pet, now);
  if (item.hunger > 0 && item.happy === 0 && user.pet.hunger >= 100) return { ok: false, error: `${petName(user.pet)} ya está llena` };
  user.coins -= item.price;
  user.pet.hunger = round1(clamp(user.pet.hunger + item.hunger));
  user.pet.happy = round1(clamp(user.pet.happy + item.happy));
  return { ok: true, item };
}

function cuddle(user, now) {
  tick(user.pet, now);
  const wait = PET_COOLDOWN_MS - (now - user.pet.lastPet);
  if (user.pet.lastPet && wait > 0) return { ok: false, error: `${petName(user.pet)} quiere un ratito más (${Math.ceil(wait / 1000)} s)` };
  user.pet.lastPet = now;
  user.pet.happy = round1(clamp(user.pet.happy + PET_HAPPY));
  return { ok: true };
}

function configure(user, { kind, name } = {}) {
  if (PET_KINDS.includes(kind)) user.pet.kind = kind;
  if (typeof name === 'string') user.pet.name = name.replace(/\s+/g, ' ').trim().slice(0, 14).trim();
}

function petName(pet) {
  return pet.name || { perrito: 'Tu perrito', gatito: 'Tu gatito', pollito: 'Tu pollito', slime: 'Tu slime' }[pet.kind];
}

function mood(pet) {
  if (pet.hunger < 25) return 'hambre';
  if (pet.happy < 25) return 'triste';
  if (pet.hunger > 70 && pet.happy > 70) return 'feliz';
  return 'bien';
}

function publicPet(pet) {
  return { kind: pet.kind, name: pet.name, hunger: Math.round(pet.hunger), happy: Math.round(pet.happy), mood: mood(pet) };
}

module.exports = { PET_KINDS, SHOP, DECAY_PER_HOUR, PET_COOLDOWN_MS, newPet, tick, buy, cuddle, configure, mood, publicPet };
