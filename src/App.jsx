import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

// External Firebase Imports (assuming they are set up in your Vite project)
// Note: For a real Vite app, you'd use npm/yarn to install firebase
// import { initializeApp } from 'firebase/app';
// import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
// import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// Polyfill for structuredClone for wider browser compatibility.
if (typeof structuredClone !== "function") {
    globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

/**
 * audioEngine.js (Integrated) - Now exposes BPM
 */
const audioEngine = (() => {
    let isInitialized = false;
    let synths = {};
    let themes = {};
    let activeTheme = null;
    let musicChannel, sfxChannel;
    let lastTickTime = 0;
    let userMusicVolume = -6;

    const createChannels = () => {
        const Tone = window.Tone;
        if (!Tone) return;
        musicChannel = new Tone.Channel({ volume: userMusicVolume, pan: 0 }).toDestination();
        sfxChannel = new Tone.Channel({ volume: 0, pan: 0 }).toDestination();
    };

    const createSynths = () => {
        const Tone = window.Tone;
        if (!Tone) return;
        const sfxReverb = new Tone.Reverb({ decay: 2, wet: 0.2 }).connect(sfxChannel);
        
        const tickReverb = new Tone.Reverb({ decay: 0.5, wet: 0.15 }).connect(sfxChannel);
        synths.tick = new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 10, oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }, volume: 0 }).connect(tickReverb);
        synths.tickNoise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.02, sustain: 0 }, volume: -22 }).connect(tickReverb);

        synths.spinBlip = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0 } }).connect(sfxReverb);
        synths.spinNoise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.01, decay: 0.5, sustain: 0 } }).connect(sfxChannel);
        const noiseFilter = new Tone.AutoFilter('8n', 500, 4).connect(sfxReverb).start();
        synths.spinNoise.connect(noiseFilter);
        synths.wheelStopChord = new Tone.PolySynth(Tone.Synth, { volume: -8, oscillator: { type: 'fatsine' }, envelope: { attack: 0.1, release: 1 } }).connect(sfxReverb);
        synths.wheelStopArp = new Tone.PluckSynth({ dampening: 6000, resonance: 0.9, volume: -5 }).connect(sfxReverb);
        synths.wheelStopArpSeq = new Tone.Sequence((time, note) => { synths.wheelStopArp.triggerAttack(note, time); }, ["C5", "E5", "G5", "C6"], "16n");
        const modalFilter = new Tone.Filter(1000, 'highpass').connect(sfxReverb);
        synths.modalWhoosh = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.05, decay: 0.3, release: 0.5 }, volume: -20 }).connect(modalFilter);
        synths.modalShimmer = new Tone.MetalSynth({ frequency: 600, harmonicity: 8, modulationIndex: 20, envelope: { attack: 0.2, decay: 0.2 }, volume: -15 }).connect(sfxReverb);
        synths.modalClose = new Tone.PluckSynth({ dampening: 4000, volume: -5 }).connect(sfxReverb);
        synths.correct = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.3, release: 0.5 }, volume: -10 }).connect(sfxReverb);
        synths.wrong = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.5, release: 0.5 }, volume: -10 }).connect(sfxReverb);
        const swellFilter = new Tone.Filter(200, 'highpass').connect(sfxReverb);
        synths.extremeSwell = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 1.5, decay: 0.2, sustain: 0, release: 0.2 }, volume: -15 }).connect(swellFilter);
        synths.extremeHit = new Tone.FMSynth({ harmonicity: 0.5, modulationIndex: 10, envelope: { attack: 0.01, decay: 1, sustain: 0, release: 1 }, volume: -5 }).connect(sfxReverb);
        synths.refuse = new Tone.Synth({ oscillator: { type: 'sine' }, portamento: 0.2, envelope: { attack: 0.1, release: 0.5 }, volume: -8 }).connect(sfxReverb);
        synths.uiConfirm = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0 }, volume: -15 }).connect(sfxChannel);
    };

    const createThemes = () => {
        const Tone = window.Tone;
        if (!Tone) return;

        const createThemePart = (synth, events) => {
            const part = new Tone.Part((time, value) => {
                synth.triggerAttackRelease(value.notes, value.duration, time);
            }, events);
            part.loop = true;
            part.loopEnd = events.reduce((max, e) => Math.max(max, Tone.Time(e.time).toSeconds() + Tone.Time(e.duration).toSeconds()), 0);
            return part;
        };

        const velourReverb = new Tone.Reverb({ decay: 5, wet: 0.5 }).connect(musicChannel);
        const velourDelay = new Tone.FeedbackDelay('8n.', 0.4).connect(velourReverb);
        const velourPad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth' }, envelope: { attack: 2, decay: 1, sustain: 0.5, release: 3 } }).connect(velourDelay);
        const velourBass = new Tone.FMSynth({ harmonicity: 0.5, modulationIndex: 5, envelope: { attack: 0.01, release: 0.5 } }).connect(velourReverb);
        themes.velourNights = { bpm: 85, parts: [ createThemePart(velourPad, [{ time: '0:0', notes: ['C3', 'E3', 'G3'], duration: '2m' }, { time: '2:0', notes: ['A2', 'C3', 'E3'], duration: '2m' }]), new Tone.Sequence((time, note) => { velourBass.triggerAttackRelease(note, '8n', time); }, ['C2', 'C2', 'C2', 'E2', 'A1', 'A1', 'A1', 'G1'], '4n') ] };
        
        const lotusReverb = new Tone.Reverb({ decay: 8, wet: 0.6 }).connect(musicChannel);
        const lotusPad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 4, release: 4 }, volume: -12 }).connect(lotusReverb);
        const lotusBell = new Tone.MetalSynth({ frequency: 400, harmonicity: 12, modulationIndex: 20, envelope: { attack: 0.01, decay: 1.5 }, volume: -15 }).connect(lotusReverb);
        themes.lotusDreamscape = { bpm: 60, parts: [ createThemePart(lotusPad, [{ time: '0:0', notes: ['C4', 'E4', 'G4'], duration: '1m' }, { time: '1m:0', notes: ['D4', 'F4', 'A4'], duration: '1m' }]), new Tone.Sequence((time, note) => { lotusBell.triggerAttack(note, time); }, [['C6', 'E6'], null, 'G5', null, 'D6', null, 'A5', null], '2n') ] };

        const velvetReverb = new Tone.Reverb({ decay: 2, wet: 0.4 }).connect(musicChannel);
        const velvetMarimba = new Tone.PolySynth(Tone.MembraneSynth, { pitchDecay: 0.01, octaves: 4, envelope: { attack: 0.005, decay: 0.3, sustain: 0 } }).connect(velvetReverb);
        const velvetBass = new Tone.Synth({ oscillator: { type: 'fmsquare' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0 } }).connect(velvetReverb);
        themes.velvetCarnival = { bpm: 110, parts: [ new Tone.Pattern((time, note) => { velvetMarimba.triggerAttackRelease(note, '8n', time); }, ['C4', 'E4', 'G4', 'A4', 'G4', 'E4'], 'randomWalk'), new Tone.Sequence((time, note) => { velvetBass.triggerAttackRelease(note, '16n', time); }, ['C2', null, 'C2', ['E2', 'D2']], '8n') ] };
        
        const crimsonDistortion = new Tone.Distortion(0.6).connect(musicChannel);
        const crimsonBass = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.5, release: 0.2 } }).connect(crimsonDistortion);
        themes.crimsonFrenzy = { bpm: 120, parts: [ new Tone.Sequence((time, note) => { crimsonBass.triggerAttackRelease(note, '16n', time); }, ['C2', 'C2', 'C2', 'C#2', 'C2', 'C2', 'C2', 'D#2'], '8n') ] };
        
        const abyssReverb = new Tone.Reverb({ decay: 10, wet: 0.7 }).connect(musicChannel);
        const abyssPad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsine' }, envelope: { attack: 8, release: 8 }, volume: -10 }).connect(abyssReverb);
        const abyssPiano = new Tone.FMSynth({ harmonicity: 3, modulationIndex: 1.5, envelope: { attack: 0.01, decay: 2, release: 2 }, volume: -15 }).connect(new Tone.FeedbackDelay('4n', 0.6).connect(abyssReverb));
        const abyssSub = new Tone.Synth({ oscillator: 'sine', envelope: { attack: 4, release: 4 }, volume: -8 }).connect(abyssReverb);
        
        let spaceNoise, noiseFilter;

        themes.starlitAbyss = {
            bpm: 60,
            parts: [
                createThemePart(abyssPad, [{ time: '0:0', notes: ['A2', 'C3', 'E3'], duration: '1m' }, { time: '1m:0', notes: ['G2', 'B2', 'D3'], duration: '1m' }]),
                new Tone.Sequence((time, note) => { abyssPiano.triggerAttackRelease(note, '2n', time) }, ['C5', null, 'E5', 'G5', null, 'D5', null, 'B4'], '2n'),
                new Tone.Sequence((time, note) => { abyssSub.triggerAttackRelease(note, '1m', time)}, ['A1', 'G1'], '1m')
            ],
            init: () => {
                spaceNoise = new Tone.Noise('brown').start();
                noiseFilter = new Tone.AutoFilter({ frequency: '8m', baseFrequency: 100, octaves: 2}).connect(musicChannel).start();
                spaceNoise.connect(noiseFilter);
                spaceNoise.volume.value = -25;
            },
            cleanup: () => {
                if(spaceNoise && spaceNoise.state === 'started') spaceNoise.stop().dispose();
                if(noiseFilter && noiseFilter.started) noiseFilter.stop().dispose();
            }
        };
    };

    const publicApi = {
        async initialize() {
            if (isInitialized || !window.Tone) return false;
            try { await window.Tone.start(); if (window.Tone.context.state !== 'running') return false; createChannels(); createSynths(); createThemes(); isInitialized = true; console.log("Audio Engine Initialized."); return true; } 
            catch (e) { console.error("Audio Engine Init Error:", e); return false; }
        },
        async startTheme(themeName) {
            const Tone = window.Tone;
            if (!isInitialized || !Tone || !themes[themeName]) return;

            if (Tone.context.state !== "running") {
              await Tone.start();
            }
            if (Tone.Transport.state !== "started") {
              Tone.Transport.start();
            }

            if (activeTheme && activeTheme.name === themeName) return;

            const startNewThemeAndFadeIn = () => {
                if (activeTheme) {
                    if (activeTheme.cleanup) activeTheme.cleanup();
                    activeTheme.parts.forEach(p => {
                        if (p.stop) p.stop(0);
                        if (p.cancel) p.cancel(0);
                        // --- FIX: Do not dispose of reusable parts, as they are defined once and reused.
                        // if (p && typeof p.dispose === "function") p.dispose();
                    });
                }

                activeTheme = themes[themeName];
                activeTheme.name = themeName;
                
                Tone.Transport.bpm.value = activeTheme.bpm;
                if (activeTheme.init) activeTheme.init();
                activeTheme.parts.forEach(p => p.start(0));
                musicChannel.volume.rampTo(userMusicVolume, 1.5);
            };

            if (activeTheme && Tone.Transport.state === 'started') {
                musicChannel.volume.rampTo(-Infinity, 0.5);
                setTimeout(startNewThemeAndFadeIn, 550);
            } else {
                startNewThemeAndFadeIn();
            }
        },
        stopTheme() { 
            const Tone = window.Tone; 
            if (!isInitialized || !Tone || !activeTheme) return; 
            if (activeTheme.cleanup) activeTheme.cleanup();
            activeTheme.parts.forEach(p => { 
                if (p.stop) p.stop(0);
                if (p.cancel) p.cancel(0);
                // --- FIX: Do not dispose of reusable parts, as they are defined once and reused.
                // if (p && typeof p.dispose === "function") p.dispose();
            }); 
            activeTheme = null; 
            if (Tone.Transport.state === 'started') {
                Tone.Transport.stop(); 
                Tone.Transport.cancel(0);
            }
        },
        getCurrentBpm: () => activeTheme ? activeTheme.bpm : 85,
        toggleMute(shouldMute) { const Tone = window.Tone; if (!isInitialized || !Tone) return; Tone.Destination.mute = shouldMute; },
        setMasterVolume(levelInDb) { if (isInitialized && window.Tone) window.Tone.Destination.volume.value = levelInDb; },
        setMusicVolume(levelInDb) { 
            if (isInitialized && musicChannel) {
                userMusicVolume = levelInDb;
                musicChannel.volume.value = levelInDb;
            }
        },
        setSfxVolume(levelInDb) { if (isInitialized && sfxChannel) sfxChannel.volume.value = levelInDb; },
        playWheelSpinStart: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.spinBlip.triggerAttackRelease('C5', '8n', now); synths.spinNoise.triggerAttack(now); },
        playWheelTick: () => {
            if (!isInitialized) return;
            const now = window.Tone.now();
            if (now - lastTickTime > 0.03) {
                synths.tick.triggerAttackRelease('C7', '32n', now);
                synths.tickNoise.triggerAttackRelease('32n', now);
                lastTickTime = now;
            }
        },
        playWheelStopSound: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.wheelStopChord.triggerAttackRelease(['E4', 'G4', 'C5'], '4n', now); synths.wheelStopArpSeq.start(now).stop(now + 0.5); },
        playModalOpen: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.modalWhoosh.triggerAttack(now); synths.modalShimmer.triggerAttackRelease('2n', now + 0.1); },
        playModalClose: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.modalClose.triggerAttack('G5', now); synths.modalClose.triggerAttack('C4', now + 0.1); },
        playCorrect: () => { if (!isInitialized) return; synths.correct.triggerAttackRelease(['C5', 'E5', 'G5'], '8n', window.Tone.now()); },
        playWrong: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.wrong.frequency.setValueAtTime('G4', now); synths.wrong.frequency.linearRampToValueAtTime('G3', now + 0.4); synths.wrong.triggerAttack(now); synths.wrong.triggerRelease(now + 0.4); },
        playExtremePrompt: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.extremeSwell.triggerAttack(now); synths.extremeHit.triggerAttackRelease('C1', '1m', now + 1.4); },
        playRefuse: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.refuse.triggerAttack('C6', now); synths.refuse.triggerAttack('C4', now + 0.1); },
        playUIConfirm: () => { if (!isInitialized) return; synths.uiConfirm.triggerAttackRelease('C6', '16n'); }
    };
    return publicApi;
})();

// --- DATA & PROMPTS ---
const defaultPrompts = { truthPrompts: { normal: [ "Would you remarry if your partner died?", "Do you ever regret marrying your partner?", "What's your biggest regret? Explain.", "What's your favorite thing that your partner does for you?", "What do you envision the next 50 years with your partner being like? Explain in great detail.", "Tell your partner something that they need to improve on. Go into great detail.", "What's one thing you're scared to ask me, but really want to know?", "What is a secret you've kept from your parents?", "Describe a dream you've had about me.", "If you could change one thing about our history, what would it be?", "What's the most childish thing you still do?", "What do you think is your partner's biggest strength?", "If money didn't matter, what would you want your partner to do with their life?", "What song always makes you think of your partner?", "What was your happiest childhood memory?", "What's one thing you've always wanted to tell your partner, but never have?", "What scares you most about the future with your partner?", "What's one thing you wish you and your partner could do more often?", "If you could relive one day of your relationship, which would it be?" ], spicy: [ "What's your favorite part of your partner's body?", "Describe a time they turned you on without even realizing it.", "Tell me a sexual fantasy involving us you've never shared.", "What's the most embarrassing thing that's ever happened to you during sex?", "Who's the best sexual partner you've ever had? And why?", "Name a celebrity you've had a sexual fantasy about.", "If you could only do one sex act for the rest of your life, what would it be?", "Have you ever cheated on a partner?", "Have you ever faked an orgasm with your current partner?", "Tell your partner what you're thinking about in great detail, when you're horny prior to sex.", "What's the naughtiest thought you've had about me this week?", "Rank your top three favorite positions.", "What's one thing you want me to do to you in bed more often?", "What's the sexiest dream you've ever had about your partner?", "What's the dirtiest compliment you secretly want from your partner?", "Where's the riskiest place you'd want to fool around with your partner?", "If you could make your partner wear any outfit for you, what would it be?", "What's your favorite way your partner touches you when you want it to lead to sex?", "What's a fantasy involving your partner you've never admitted out loud?", "If you could freeze time, what would you do to your partner while no one else was watching?", "What's a kink you're curious about but nervous to try with your partner?", "Which body part of your partner do you think about most when they're not around?", "What's your favorite way your partner has teased you without realizing it?" ], extreme: [ "Describe your partner's genitals in great detail.", "Which ex would you most likely allow to have a threesome with you and your partner?", "Which ex looked the best naked?", "Describe a sexual experience with an ex in great detail.", "Have you ever masturbated in an inappropriate time or place?", "What do you want to do to your partner right now? Be detailed.", "Tell your partner any ways that they can improve in bed.", "What is the biggest lie you have ever told me?", "Have you ever considered leaving me? If so, why?", "Describe the most intense orgasm you've ever had, with or without me.", "What is something you've never told anyone about your sexual history?", "Describe, in detail, your perfect sexual scenario with your partner.", "What's the nastiest thought you've ever had about your partner in public?", "If you could film yourself and your partner doing anything in bed, what would you want captured?", "What's the dirtiest porn search you've ever typed that you'd want to try with your partner?", "Which of your partner's friends have you thought about sexually (even fleetingly)?", "What's the roughest or wildest thing you secretly want your partner to do to you?", "What's your most shameful fantasy you'd never tell your partner's family?", "If you could erase one sexual experience from your past before meeting your partner, what would it be?", "What do you imagine when you masturbate that you haven't told your partner?" ] }, darePrompts: { normal: [ "Take a cute selfie with your partner.", "Give your best impression of your partner.", "Let your partner tickle you for 30 seconds.", "Give your partner a shoulder rub for 3 minutes.", "Do a somersault.", "Do 10 jumping jacks.", "Give your partner a hug, as if they were dying.", "Post a picture of your partner on social media with a loving caption.", "Let your partner draw a temporary tattoo on you with a pen.", "Serenade your partner with a love song, even if you can't sing.", "Do your best runway walk for your partner.", "Take a silly selfie right now and show your partner.", "Speak in an accent for the next 2 rounds with your partner.", "Tell your partner two truths and a lie.", "Share your screen time stats with your partner.", "Do your best dance move for your partner for 20 seconds.", "Hug a pillow and pretend it's your partner for one minute.", "Let your partner pick a silly nickname for you for the rest of the game.", "Text a random emoji to a friend and show your partner the reply.", "Sing your favorite chorus from memory to your partner.", "Pretend to be your partner for one round." ], spicy: [ "Give me a passionate kiss, as if we haven't seen each other in a month.", "Whisper what you want to do to me later tonight in my ear.", "Gently remove one item of my clothing.", "Sit in your partner's lap for 3 rounds.", "Touch your partner through their clothes until they're aroused.", "Take a sexy selfie in only your underwear and send it to your partner.", "Flash your partner a private part of your choosing.", "Explain in graphic detail how you like to masturbate.", "Give your partner a topless lap dance.", "Gently kiss your partner's naked genitals.", "Let me choose an item of your clothing for you to remove.", "Give your partner a hickey somewhere they can hide it.", "Describe how you would tease me if we were in public right now.", "Describe out loud how you'd undress your partner right now.", "Let your partner choose a body part for you to kiss.", "Show your partner how you'd seduce them in public without anyone noticing.", "Whisper something filthy in your partner's ear.", "Stroke your partner's hand or arm like you would in foreplay.", "Show your partner your sexiest facial expression.", "Bite your lip and hold eye contact with your partner for 30 seconds.", "Kiss your partner as if it were your first time.", "Moan your partner's name in a way that turns them on." ], extreme: [ "Give your partner a hand job for 3 minutes.", "Sit on your partner's face, or let them sit on your face for 3 minutes.", "Soak for 5 minutes.", "Masturbate for 5 minutes while watching porn that your partner picked.", "Edge your partner twice.", "Perform oral sex on your partner for 2 minutes.", "Use a sex toy on your partner for 3 minutes.", "Allow your partner to use any sex toy they'd like on your for the next 5 minutes.", "Wear a butt plug for the next 10 minutes.", "Let your partner tie you up for 5 minutes and do what they want.", "Roleplay a fantasy of your partner's choosing for 5 minutes.", "Take a nude photo and send it to your partner right now.", "Lick or suck on a body part your partner chooses.", "Let your partner spank you as hard as they want 5 times.", "Send your partner a dirty voice note moaning their name.", "Simulate oral sex on your fingers for 30 seconds in front of your partner.", "Strip completely naked and pose however your partner says.", "Show your partner how you masturbate, in detail.", "Act out your favorite porn scene with your partner.", "Put something of your partner's in your mouth and treat it like foreplay.", "Let your partner tie your hands for the next 3 rounds.", "Edge yourself while your partner watches for 2 minutes.", "Edge your partner while you watch for 2 minutes." ] }, triviaQuestions: { normal: [ "What is your partner's birthday?", "What is your partner's favorite show?", "What is their biggest insecurity?", "What is your partner's biggest fear?", "What is their dream job if money were no object?", "What is one thing your partner has always wanted to try but hasn't yet?", "What is the first gift you gave each other?", "What is your partner's favorite childhood cartoon?", "What is the name of your partner's first pet?", "What is your partner's favorite board game?", "Would you rather go into the past and meet your ancestors or go into the future and meet your great-great grandchildren?", "What was their favorite band in high school?", "What do they love most about themselves?", "What do they love the most about you?", "What's my favorite animal?", "If they could haunt anyone as a ghost, who would it be?", "What is their dream vacation?", "What accomplishment are they most proud of?", "What historical figure would they most want to have lunch with?", "What is their least favorite food?", "What's your partner's go-to comfort food?", "What movie does your partner always want to rewatch?", "What's your partner's biggest pet peeve?", "Which holiday does your partner love the most?", "What's your partner's dream car?", "What color does your partner secretly dislike wearing?", "Who was your partner's first celebrity crush?", "What's your partner's most annoying habit (to you)?", "If your partner could instantly master one skill, what would it be?" ] }, consequences: { normal: [ "You have to call your partner a name of their choosing for the rest of the game.", "Every wrong answer for the rest of the game gets you tickled for 20 seconds.", "Go get your partner a drink.", "Make your partner a snack.", "You have to end every sentence with 'my love' for the next 3 rounds.", "Give your partner your phone and let them send one playful text to anyone.", "Compliment your partner 5 times in a row.", "Give your partner control of the TV remote tonight.", "Swap seats with your partner for the next round.", "Tell your partner a secret you've never told them.", "Let your partner take an unflattering picture of you.", "You can only answer your partner with 'yes, my love' until your next turn.", "Wear a silly hat (or make one) until the game ends with your partner.", "Post a sweet compliment about your partner on social media." ], spicy: [ "Play the next 3 rounds topless.", "For the next 5 rounds, every time it's your turn, you have to start by kissing your partner.", "Your partner gets to give you one command, and you must obey.", "Play the next 3 rounds bottomless.", "Every wrong answer or refusal requires you to send your partner a nude picture for the rest of the game. Even your partner's wrong answers.", "Remove an article of clothing each round for the remainder of the game.", "Do ten jumping jacks completely naked.", "Swap clothes with your partner for the remainder of the game.", "Your partner gets to spank you, as hard as they want, 5 times.", "Kiss your partner somewhere unexpected.", "Tell your partner your dirtiest thought in the last 24 hours.", "For the next round, sit on your partner's lap.", "Let your partner bite or nibble a place of their choice.", "You have to let your partner mark you with lipstick or a marker.", "Show your partner your favorite sex position (with clothes on).", "Tease your partner without kissing for 1 minute.", "Send your partner a sexy text right now while sitting next to them.", "Give your partner a 1-minute lap dance." ], extreme: [ "Wear a butt plug for the remainder of the game.", "Record yourself masturbating right now and send it to your partner.", "Use a sex toy of your partner's choosing for the remainder of the game.", "Edge yourself for the remainder of the game.", "Allow your partner to act out a fantasy of theirs, and you can't say no.", "You must perform any sexual act your partner demands, right now.", "Send your partner the filthiest nude you've ever taken.", "Use your tongue on any body part your partner picks.", "Strip completely and stay that way until the round ends with your partner.", "Let your partner spank or choke you until they're satisfied.", "Put on a show of how you like to be touched for your partner.", "Allow your partner to record 30 seconds of you doing something sexual.", "Play with a toy in front of your partner right now.", "Moan out loud for 1 minute straight for your partner.", "Let your partner pick your sexual punishment and don't complain." ] } };

// Mock hook for previewing without Firebase
// In a real Vite app, you would import the actual hook
const useFirestorePrompts = () => {
    const [prompts, setPrompts] = useState(defaultPrompts);
    const updatePrompts = (newPrompts) => {
        setPrompts(newPrompts);
    };
    return { prompts, updatePrompts, isLoading: false, userId: 'preview-user-123' };
};

// --- ENHANCEMENT: Parallax Hook ---
const useParallax = (strength = 10) => {
    const ref = useRef(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const springX = useSpring(x, { stiffness: 300, damping: 30 });
    const springY = useSpring(y, { stiffness: 300, damping: 30 });

    const rotateX = useTransform(springY, [-0.5, 0.5], [`${strength}deg`, `-${strength}deg`]);
    const rotateY = useTransform(springX, [-0.5, 0.5], [`-${strength}deg`, `${strength}deg`]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        
        let ticking = false;

        const handleMouseMove = (e) => {
            if (!ticking) {
                ticking = true;
                window.requestAnimationFrame(() => {
                    const rect = el.getBoundingClientRect();
                    const width = rect.width;
                    const height = rect.height;
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    const xPct = mouseX / width - 0.5;
                    const yPct = mouseY / height - 0.5;
                    x.set(xPct);
                    y.set(yPct);
                    ticking = false;
                });
            }
        };

        const handleMouseLeave = () => {
            x.set(0);
            y.set(0);
        };

        el.addEventListener("mousemove", handleMouseMove);
        el.addEventListener("mouseleave", handleMouseLeave);
        return () => {
            if (el) {
                el.removeEventListener("mousemove", handleMouseMove);
                el.removeEventListener("mouseleave", handleMouseLeave);
            }
        };
    }, [x, y]);

    return { ref, style: { rotateX, rotateY, transformStyle: "preserve-3d" } };
};

// --- UI COMPONENTS ---
const CloseIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>);
const SettingsIcon = React.memo(() => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1.51-1V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V12c0 .36.05.7.14 1.03.22.84.97 1.34 1.77 1.34h.09a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09A1.65 1.65 0 0 0 19.4 15z"></path></svg>));
const SpeakerIcon = React.memo(({ muted }) => ( muted ? (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="22" y1="9" x2="16" y2="15"></line><line x1="16" y1="9" x2="22" y2="15"></line></svg>) : (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>) ));
const CustomPromptIcon = React.memo(() => (<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--theme-highlight)] opacity-70" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>));
const TrashIcon = React.memo(() => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#F777B6] hover:text-[#FFC0CB]" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>));
const SpinLoader = () => (<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="animate-spin" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" strokeDasharray="16 12" opacity="0.4"></circle><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" strokeDasharray="56.548" strokeDashoffset="42.411" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" /></circle></svg>);

const hexToRgb = (hex) => {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

// --- ENHANCEMENT: Theme-specific particles ---
const ParticleBackground = React.memo(({ currentTheme, pulseLevel, bpm, reducedMotion }) => {
    const canvasRef = useRef(null);
    const animationFrameId = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width, height, particles = [];
        let isHidden = document.hidden;

        const handleVisibilityChange = () => {
            isHidden = document.hidden;
            if (!isHidden && !reducedMotion && !animationFrameId.current) {
                animationFrameId.current = requestAnimationFrame(animate);
            }
        };
        
        const isMobile = window.innerWidth < 768;
        
        const themeConfig = {
            velourNights: { num: isMobile ? 80 : 120, palette: ['#F777B6', '#FFD700', '#FFFFFF'], type: 'ember' },
            lotusDreamscape: { num: isMobile ? 60 : 100, palette: ['#6A5ACD', '#FFFFFF', '#ADD8E6'], type: 'mote' },
            velvetCarnival: { num: isMobile ? 100 : 150, palette: ['#FFD700', '#FF4500', '#FFFFFF', '#F777B6'], type: 'confetti' },
            starlitAbyss: { num: isMobile ? 150 : 250, palette: ['#FFFFFF', '#E6E6FA', '#D8BFD8'], type: 'star' },
            crimsonFrenzy: { num: isMobile ? 80 : 120, palette: ['#FFD700', '#DC2626', '#FF4500'], type: 'spark' }
        };

        const activeConfig = themeConfig[currentTheme] || themeConfig.velourNights;
        
        const drawStatic = () => {
            ctx.clearRect(0, 0, width, height);
            const staticConfig = themeConfig[currentTheme] || themeConfig.starlitAbyss; // Default to stars
            const numStaticStars = staticConfig.num / 3;
            for (let i = 0; i < numStaticStars; i++) {
                const color = staticConfig.palette[Math.floor(Math.random() * staticConfig.palette.length)];
                ctx.fillStyle = color;
                const x = Math.random() * width;
                const y = Math.random() * height;
                const r = Math.random() * 1.2;
                ctx.globalAlpha = Math.random() * 0.5 + 0.1;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        };

        const resizeCanvas = () => { 
            width = canvas.width = canvas.offsetWidth; 
            height = canvas.height = canvas.offsetHeight; 
            if (reducedMotion) {
                drawStatic();
            } else {
                createParticles();
            }
        };

        if (reducedMotion) {
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
            return () => {
                window.removeEventListener('resize', resizeCanvas);
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange);

        class Particle {
            constructor(i) {
                this.index = i;
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.layer = Math.random();
                const baseColorHex = activeConfig.palette[Math.floor(Math.random() * activeConfig.palette.length)];
                this.baseColorRgb = hexToRgb(baseColorHex);
                this.type = activeConfig.type;
                this.initType();
            }

            initType() {
                const intensity = pulseLevel / 100;
                let speedMultiplier = 1;
                if (pulseLevel > 80) speedMultiplier = 1.8;
                else if (pulseLevel > 50) speedMultiplier = 1.5;

                switch(this.type) {
                    case 'star':
                        this.radius = Math.random() * (this.layer > 0.6 ? 1.2 : 0.7) + 0.1;
                        this.speedX = (Math.random() - 0.5) * 0.05 * this.layer * speedMultiplier;
                        this.speedY = (Math.random() - 0.5) * 0.05 * this.layer * speedMultiplier;
                        this.shadowBlur = this.radius * 3 + (intensity * 3);
                        this.baseAlpha = 0.2 + this.layer * 0.8;
                        break;
                    case 'ember':
                    case 'spark':
                        this.radius = Math.random() * 1.5 + 0.5;
                        this.speedX = (Math.random() - 0.5) * (0.1 + intensity * 0.3) * speedMultiplier;
                        this.speedY = -Math.random() * (0.3 + intensity * 0.7) * speedMultiplier;
                        this.shadowBlur = this.radius * 4 + (intensity * 4);
                        this.baseAlpha = Math.random() * 0.5 + 0.2;
                        this.life = Math.random() * 50 + 50;
                        break;
                    default: // mote, confetti
                        this.radius = Math.random() * (this.type === 'confetti' ? 2.5 : 1.5) + 0.5;
                        this.speedX = (Math.random() - 0.5) * (0.2 + intensity * 0.4) * speedMultiplier;
                        this.speedY = (Math.random() - 0.5) * (0.2 + intensity * 0.4) * speedMultiplier;
                        this.shadowBlur = this.radius * 2;
                        this.baseAlpha = Math.random() * 0.6 + 0.1;
                }
            }

            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                
                if (this.type === 'ember' || this.type === 'spark') {
                    this.life--;
                    if(this.life <= 0) {
                        this.x = Math.random() * width;
                        this.y = height + this.radius * 2;
                        this.life = Math.random() * 50 + 50;
                        this.baseAlpha = Math.random() * 0.5 + 0.2;
                    }
                } else {
                     if (this.x < -this.radius) this.x = width + this.radius;
                     if (this.x > width + this.radius) this.x = -this.radius;
                     if (this.y < -this.radius) this.y = height + this.radius;
                     if (this.y > height + this.radius) this.y = -this.radius;
                }
            }

            draw(frameCount) { 
                if (Math.random() < 0.1) ctx.filter = 'blur(1px)'; 
                else ctx.filter = 'none';

                const beatDuration = 60 / bpm;
                const bpmFactor = Math.max(0.8, Math.min(1.4, 1 / beatDuration));
                const twinkleSpeed = (0.005 + (this.index % 10) * 0.001) * bpmFactor;

                const twinkleValue = this.type === 'star' ? 0.5 + 0.5 * Math.abs(Math.sin(frameCount * twinkleSpeed + this.index)) : 1;
                let alpha = this.baseAlpha * twinkleValue;
                if(this.type === 'ember' || this.type === 'spark') alpha *= this.life / 50;
                
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                const color = `rgba(${this.baseColorRgb.r}, ${this.baseColorRgb.g}, ${this.baseColorRgb.b}, ${alpha})`;
                
                if (pulseLevel > 80) {
                    ctx.shadowBlur = this.radius * 6; // Streak effect
                    ctx.shadowColor = `rgba(${this.baseColorRgb.r}, ${this.baseColorRgb.g}, ${this.baseColorRgb.b}, ${alpha * 0.5})`;
                } else {
                    ctx.shadowBlur = this.shadowBlur;
                    ctx.shadowColor = `rgba(${this.baseColorRgb.r}, ${this.baseColorRgb.g}, ${this.baseColorRgb.b}, 0.8)`;
                }
                
                ctx.fillStyle = color;
                ctx.fill();
                ctx.filter = 'none';
            }
        }
        
        const createParticles = () => {
            particles = [];
            for (let i = 0; i < activeConfig.num; i++) {
                particles.push(new Particle(i));
            }
        };

        let frameCount = 0;
        const animate = () => { 
            if (isHidden || !canvasRef.current || reducedMotion) {
                animationFrameId.current = null;
                return;
            }
            ctx.clearRect(0, 0, width, height); 
            particles.forEach(p => { p.update(); p.draw(frameCount); }); 
            frameCount++;
            animationFrameId.current = requestAnimationFrame(animate); 
        };

        resizeCanvas(); 
        animate();
        
        window.addEventListener('resize', resizeCanvas);
        
        return () => { 
            window.removeEventListener('resize', resizeCanvas); 
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = null;
            }
        };
    }, [currentTheme, pulseLevel, bpm, reducedMotion]);

    return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full opacity-100 z-[40] pointer-events-none"></canvas>;
});

const Confetti = ({ onFinish, origin, theme, reducedMotion }) => {
    const canvasRef = useRef(null);
    const originRef = useRef(origin);

    useEffect(() => {
        originRef.current = origin;
    }, [origin]);

    useEffect(() => {
        if (reducedMotion) {
            if (onFinish) onFinish();
            return;
        }

        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        
        const resizeConfetti = () => {
            let width = canvas.offsetWidth;
            let height = canvas.offsetHeight;
            canvas.width = width * ratio;
            canvas.height = height * ratio;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        };
        window.addEventListener('resize', resizeConfetti);
        resizeConfetti();
        
        const themePalettes = {
            velourNights: ['#F777B6', '#FFD700', '#FFFFFF'],
            lotusDreamscape: ['#6A5ACD', '#FFFFFF', '#ADD8E6'],
            velvetCarnival: ['#FFD700', '#FF4500', '#FFFFFF'],
            starlitAbyss: ['#FFFFFF', '#E6E6FA', '#D8BFD8'],
            crimsonFrenzy: ['#FFD700', '#DC2626', '#FFFFFF']
        };
        const colors = themePalettes[theme] || themePalettes.velourNights;

        const particles = [];
        const particleCount = 200;
        const gravity = 0.1;
        const friction = 0.98;
        
        const currentOriginX = originRef.current.x * canvas.offsetWidth;
        const currentOriginY = originRef.current.y * canvas.offsetHeight;

        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 4;
            particles.push({ 
                x: currentOriginX, 
                y: currentOriginY, 
                vx: Math.cos(angle) * speed, 
                vy: Math.sin(angle) * speed, 
                radius: Math.random() * 6 + 4, 
                color: colors[Math.floor(Math.random() * colors.length)], 
                tiltAngle: Math.random() * Math.PI, 
                tiltAngleIncrement: Math.random() * 0.1 - 0.05,
                alpha: 1
            });
        }
        
        let animationFrameId;
        const startTime = Date.now();
        const animate = () => {
            const allFaded = particles.every(p => p.alpha <= 0);
            if (Date.now() - startTime > 4000 || allFaded) { 
                if (animationFrameId) cancelAnimationFrame(animationFrameId); 
                if(onFinish) onFinish(); 
                return; 
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach((p) => {
                p.vy += gravity;
                p.vx *= friction;
                p.vy *= friction;
                p.x += p.vx;
                p.y += p.vy;
                p.alpha -= 0.005;
                p.tiltAngle += p.tiltAngleIncrement;
                
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.max(0, p.alpha);
                ctx.beginPath(); 
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.tiltAngle);
                ctx.fillRect(-p.radius/2, -p.radius, p.radius, p.radius*2);
                ctx.restore();
            });
            ctx.globalAlpha = 1;
            animationFrameId = requestAnimationFrame(animate);
        };
        animate();
        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', resizeConfetti);
            particles.length = 0; // Clear particles array to prevent memory leaks
        };
    }, [onFinish, theme, reducedMotion]);

    return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full z-[100] pointer-events-none" />;
};

const CATEGORIES = ['TRUTH', 'DARE', 'TRIVIA'];
// Physical offset of the pointer graphic in degrees, clockwise.
const POINTER_OFFSET = 7;

const Wheel = React.memo(({ onSpinFinish, playWheelSpinStart, playWheelTick, playWheelStop, setIsSpinInProgress, currentTheme, canSpin, reducedMotion }) => {
    const [isSpinning, setIsSpinning] = useState(false);
    const [isPointerSettling, setIsPointerSettling] = useState(false);
    const rotationRef = useRef(0);
    const canvasRef = useRef(null);
    const animationFrameRef = useRef(null);
    const spinLock = useRef(false);
    const lastSpinTimeRef = useRef(0);
    const parallax = useParallax(5);

    useEffect(() => () => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
    }, []);

    useEffect(() => {
        const handler = setTimeout(() => {
            if (reducedMotion && canvasRef.current && !spinLock.current) {
                canvasRef.current.style.transform = 'none';
            }
        }, 100);

        return () => clearTimeout(handler);
    }, [reducedMotion]);

    const drawWheel = useMemo(() => (ctx, size) => {
        const center = size / 2;
        const radius = Math.max(0, center - 25);
        const hubRadius = size / 10;
        const arc = (2 * Math.PI) / CATEGORIES.length;
        
        ctx.clearRect(0, 0, size, size);

        const themePalettes = {
            velourNights: { rim: { base: '#D4AF37', high: '#FFD700', low: '#7A5C00' }, slices: { DARE: { base: "#DC143C", high: "#FF6F91", low: "#7A1C1C" }, TRUTH: { base: "#6A0DAD", high: "#B266FF", low: "#2E003E" }, TRIVIA: { base: "#D4AF37", high: "#FFD700", low: "#7A5C00" } } },
            lotusDreamscape: { rim: { base: '#C0C0C0', high: '#E6E6FA', low: '#5A5A7A' }, slices: { DARE: { base: "#DA70D6", high: "#FFB7FF", low: "#5A2D6A" }, TRUTH: { base: "#4169E1", high: "#7AA2FF", low: "#1A1A66" }, TRIVIA: { base: "#C0C0C0", high: "#E6E6FA", low: "#5A5A7A" } } },
            velvetCarnival: { rim: { base: '#FF4500', high: '#FF944D', low: '#662200' }, slices: { DARE: { base: "#FF4500", high: "#FF944D", low: "#662200" }, TRUTH: { base: "#9B111E", high: "#FF4C5B", low: "#400000" }, TRIVIA: { base: "#D4AF37", high: "#FFD700", low: "#7A5C00" } } },
            starlitAbyss: { rim: { base: '#4C4A9E', high: '#8A2BE2', low: '#1C1030' }, slices: { DARE: { base: "#483D8B", high: "#8A2BE2", low: "#1C1030" }, TRUTH: { base: "#191970", high: "#4169E1", low: "#0A0A33" }, TRIVIA: { base: "#6C5CE7", high: "#A29BFE", low: "#2D3436" } } },
            crimsonFrenzy: { rim: { base: '#8B0000', high: '#DC143C', low: '#3D0000' }, slices: { DARE: { base: '#DC143C', high: '#FF6F91', low: '#7A1C1C' }, TRUTH: { base: "#483D8B", high: "#8A2BE2", low: "#1C1030" }, TRIVIA: { base: "#D4AF37", high: "#FFD700", low: "#7A5C00" } } }
        };

        const activePalette = themePalettes[currentTheme] || themePalettes.velourNights;
        const rimColors = activePalette.rim;

        CATEGORIES.forEach((category, i) => {
            const sliceColorSet = activePalette.slices[category];
            if (!sliceColorSet) return;
            const { base, high, low } = sliceColorSet;
            const startAngle = i * arc - Math.PI / 2 - (arc / 2); // Center categories
            const endAngle = (i + 1) * arc - Math.PI / 2 - (arc / 2);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(center, center);
            if (radius > 0) ctx.arc(center, center, radius, startAngle, endAngle);
            ctx.closePath();
            
            const grad = ctx.createRadialGradient(center, center, hubRadius, center, center, radius);
            grad.addColorStop(0, high);
            grad.addColorStop(0.8, base);
            grad.addColorStop(1, low);
            ctx.fillStyle = grad;
            ctx.fill();

            ctx.clip();
            const stripeGrad = ctx.createLinearGradient(0,0,size,size);
            stripeGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
            stripeGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
            stripeGrad.addColorStop(1, 'rgba(255,255,255,0.08)');
            ctx.fillStyle = stripeGrad;
            
            ctx.save();
            ctx.translate(center, center);
            ctx.rotate(Math.PI / 6);
            ctx.fillRect(-size, -size/4, size*2, size/2);
            ctx.rotate(-Math.PI / 3);
            ctx.fillRect(-size, -size/4, size*2, size/2);
            ctx.restore();
            ctx.restore();
        });
        
        for(let i=0; i < CATEGORIES.length; i++) {
            const angle = i * arc - Math.PI / 2 - (arc / 2);
            ctx.save();
            ctx.translate(center, center);
            ctx.rotate(angle);

            ctx.beginPath();
            ctx.moveTo(hubRadius - 5, 0);
            ctx.lineTo(radius + 2, 0);
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(hubRadius - 5, -1);
            ctx.lineTo(radius + 2, -1);
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }

        const rimWidth = 8;
        ctx.strokeStyle = rimColors.low;
        ctx.lineWidth = rimWidth + 2;
        ctx.shadowColor = getComputedStyle(document.body).getPropertyValue('--theme-highlight').trim() || '#FFD700';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        if (radius > 0) ctx.arc(center, center, radius + rimWidth / 2, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.shadowBlur = 0;

        const rimGrad = ctx.createLinearGradient(center - radius, center - radius, center + radius, center + radius);
        rimGrad.addColorStop(0, rimColors.high);
        rimGrad.addColorStop(0.5, rimColors.base);
        rimGrad.addColorStop(1, rimColors.low);
        ctx.strokeStyle = rimGrad;
        ctx.lineWidth = rimWidth;
        ctx.beginPath();
        if (radius > 0) ctx.arc(center, center, radius + rimWidth / 2, 0, 2 * Math.PI);
        ctx.stroke();
        
        for(let i=1; i <= 12; i++) {
            ctx.beginPath();
            if (radius > 0) ctx.arc(center, center, radius + (rimWidth/2) - (i*0.5), 0, 2*Math.PI);
            ctx.strokeStyle = `rgba(0,0,0,${i % 2 === 0 ? 0.1 : 0.05})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (radius > 0) ctx.arc(center, center, radius, 0, 2 * Math.PI);
        ctx.stroke();

        CATEGORIES.forEach((category, i) => {
            const textAngle = i * arc - Math.PI / 2;
            ctx.save();
            ctx.translate(center, center);
            ctx.rotate(textAngle);
            ctx.font = `800 ${size / 15}px 'Inter', sans-serif`;
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.9)';
            ctx.shadowBlur = 10;
            const textRadius = radius * 0.6;
            ctx.fillText(category, textRadius, 0);
            ctx.restore();
        });

        /*
        // Optional Debug Overlay: Uncomment to see the pointer's logical angle.
        ctx.save();
        ctx.translate(center, center);
        ctx.rotate((270 + POINTER_OFFSET) * Math.PI / 180); // Rotate to the pointer's logical position
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -radius);
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        */

    }, [currentTheme]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const container = canvas.parentElement;

        let resizeHandle;
        const resizeCanvas = () => {
             if (spinLock.current) return; // Prevent redraw mid-spin
            const size = Math.max(280, Math.min(container.offsetWidth, container.offsetHeight, 480));
            const ratio = Math.min(window.devicePixelRatio || 1, 2);
            const needsResize = canvas.width !== size * ratio || canvas.height !== size * ratio;
            if (needsResize) {
                canvas.width = size * ratio;
                canvas.height = size * ratio;
                canvas.style.width = `${size}px`;
                canvas.style.height = `${size}px`;
                ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            }
            drawWheel(ctx, size);
        };
        
        document.fonts.ready.then(() => {
            resizeHandle = requestAnimationFrame(resizeCanvas);
        });
        window.addEventListener('resize', resizeCanvas);

        return () => {
             window.removeEventListener('resize', resizeCanvas);
             if (resizeHandle) cancelAnimationFrame(resizeHandle);
        }
    }, [drawWheel]);
    
    const finalizeSpin = useCallback(() => {
      const rotation = rotationRef.current % 360;
      const sliceAngle = 360 / CATEGORIES.length;
    
      // Correct rotation relative to pointer's true top position
      const correctedRotation = (rotation + POINTER_OFFSET) % 360;
    
      // Pointer is at 0° (top), no +90 offset
      const effectiveAngle = (360 - correctedRotation) % 360;
    
      const sliceIndex = Math.floor(effectiveAngle / sliceAngle);
      const winner = CATEGORIES[sliceIndex % CATEGORIES.length].toLowerCase();
      onSpinFinish(winner);
    }, [onSpinFinish]);

    const handleSpin = useCallback(() => {
        const now = Date.now();
        if (spinLock.current || !canSpin || now - lastSpinTimeRef.current < 1000) {
            return;
        }
        lastSpinTimeRef.current = now;

        requestAnimationFrame(() => {
            if (spinLock.current) return;
            spinLock.current = true;
            
            setIsSpinning(true);
            setIsSpinInProgress(true);
            playWheelSpinStart();

            // Failsafe to unlock spin button if animation hangs for any reason
            const failsafeTimer = setTimeout(() => {
                if (spinLock.current) {
                    console.warn('Failsafe spin reset triggered.');
                    spinLock.current = false;
                    setIsSpinning(false);
                    setIsSpinInProgress(false);
                    if (animationFrameRef.current) {
                        cancelAnimationFrame(animationFrameRef.current);
                        animationFrameRef.current = null;
                    }
                }
            }, 7000);

            if (reducedMotion) {
                clearTimeout(failsafeTimer);
                const startAngle = rotationRef.current % 360;
                const spinDegrees = 360 + Math.random() * 360;
                const targetAngle = startAngle + spinDegrees;
                
                rotationRef.current = targetAngle;
                if (canvasRef.current) {
                    canvasRef.current.style.transition = 'transform 0.5s ease-out';
                    canvasRef.current.style.transform = `rotate(${targetAngle}deg)`;
                }

                playWheelTick();
                setTimeout(() => playWheelTick(), 80);

                setTimeout(() => {
                    playWheelStop();
                    setIsPointerSettling(true);
                    finalizeSpin();
                    
                    setTimeout(() => {
                        setIsSpinning(false);
                        setIsSpinInProgress(false);
                        spinLock.current = false;
                        if(canvasRef.current) canvasRef.current.style.transition = '';
                    }, 500);
                }, 500);
                return;
            }

            // Full Animation Logic
            const rand = Math.random();
            const duration = 4500 + rand * 1000;
            const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
            const start = performance.now();
            const startAngle = rotationRef.current % 360;
            const spinDegrees = 7200 + rand * 3600;
            const targetAngle = startAngle + spinDegrees;
            let lastTickAngle = startAngle;

            const animate = (now) => {
                const elapsed = now - start;
                const t = Math.min(elapsed / duration, 1);
                const eased = easeOutCubic(t);
                const currentAngle = startAngle + eased * spinDegrees;
                
                if (canvasRef.current) {
                    try {
                        canvasRef.current.style.transform = `rotate(${currentAngle}deg)`;
                    } finally {
                         if (t >= 1) {
                            canvasRef.current.style.transition = '';
                         }
                    }
                }

                const TICK_DEGREES = 360 / CATEGORIES.length / 2;
                if (currentAngle - lastTickAngle >= TICK_DEGREES) {
                    playWheelTick();
                    lastTickAngle += TICK_DEGREES;
                }

                if (t < 1) {
                    animationFrameRef.current = requestAnimationFrame(animate);
                } else {
                    clearTimeout(failsafeTimer);
                    animationFrameRef.current = null;
                    rotationRef.current = targetAngle;
                    playWheelStop();
                    setIsSpinning(false);
                    setIsPointerSettling(true);
                    finalizeSpin();
                    spinLock.current = false;
                }
            };
            animationFrameRef.current = requestAnimationFrame(animate);
        });
    }, [canSpin, setIsSpinInProgress, playWheelSpinStart, playWheelTick, playWheelStop, finalizeSpin, reducedMotion]);

    return (
        <motion.div ref={parallax.ref} style={parallax.style} className="wheel-container">
             <motion.div 
                className="pointer"
                animate={isPointerSettling ? "settle" : "rest"}
                variants={{
                    rest: { rotate: 0 },
                    settle: { rotate: [0, -3, 2.5, -1.5, 0.5, 0] }
                }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                onAnimationComplete={() => setIsPointerSettling(false)}
            >
                <div className="pointer-tip-outer">
                    <div className="pointer-tip-inner"></div>
                </div>
            </motion.div>
            <canvas
                ref={canvasRef}
                className="wheel-canvas"
            />
            <div className="hub">
                <button 
                    aria-label="Spin the wheel" 
                    onClick={handleSpin} 
                    disabled={isSpinning || !canSpin} 
                    className="btn btn--primary spin-button"
                >
                    <div className="spin-button-text">{isSpinning ? <SpinLoader /> : 'SPIN'}</div>
                </button>
            </div>
            <div className="wheel-shimmer"></div>
        </motion.div>
    );
});

const PulseMeter = ({ level, bpm }) => {
    const [showRipple, setShowRipple] = useState(false);
    const levelRef = useRef(level);
    const progress = useMotionValue(0);
    const smoothWidth = useSpring(progress, { stiffness: 100, damping: 20 });
    const width = useTransform(smoothWidth, v => `${v}%`);

    useEffect(() => {
        progress.set(Number(level));
    }, [level, progress]);

    useEffect(() => {
        if (level >= 100 && levelRef.current < 100) {
            setShowRipple(true);
        }
        levelRef.current = level;
    }, [level]);

    useEffect(() => () => setShowRipple(false), []);

    return (
        <div>
            <span id='pulse-label' className='sr-only'>Pulse Meter</span>
            <div className='pulse-meter-container' role='meter' aria-labelledby='pulse-label' aria-valuenow={level} aria-valuemin='0' aria-valuemax='100'>
                <motion.div
                    className='pulse-meter-fill'
                    style={{
                        width,
                        '--beat-duration': `${(60 / bpm) * 2}s`,
                        '--wave-duration': `${120 / bpm}s`
                    }}
                >
                    <div className='pulse-meter-gloss' />
                    <div className='pulse-meter-wave' />
                </motion.div>
                {level >= 90 && <div className='pulse-meter-outer-glow' style={{ opacity: Math.min((level - 90) / 10, 1), '--beat-duration': `${(60 / bpm) * 2}s` }}/>}
                <AnimatePresence>
                    {showRipple && (
                        <motion.div
                            className='pulse-meter-ripple'
                            initial={{ scale: 0, opacity: 0.7 }}
                            animate={{ scale: 1.5, opacity: 0 }}
                            transition={{ duration: 0.8 }}
                            onAnimationComplete={() => setShowRipple(false)}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};


const Modal = ({ isOpen, onClose, children, title, activeVisualTheme, customClasses = '' }) => {
    const parallax = useParallax(8);
    
    useEffect(() => {
        if (!isOpen) return;
        const prevActiveElement = document.activeElement;
        const timerId = setTimeout(() => { const firstFocusableElement = parallax.ref.current?.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'); if (firstFocusableElement) { firstFocusableElement.focus(); } else { parallax.ref.current?.focus(); } }, 100);
        const handleKeyDown = (event) => { 
            if (event.key === 'Escape') { 
                onClose(); 
                return; 
            } 
            if (event.key === 'Tab' && parallax.ref.current) { 
                const focusableElements = Array.from(parallax.ref.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')); 
                if (focusableElements.length === 0) return; 
                const firstElement = focusableElements[0]; 
                const lastElement = focusableElements[focusableElements.length - 1]; 
                if (event.shiftKey) { 
                    if (document.activeElement === firstElement) { 
                        lastElement.focus(); 
                        event.preventDefault(); 
                    } 
                } else { 
                    if (document.activeElement === lastElement) { 
                        firstElement.focus(); 
                        event.preventDefault(); 
                    } 
                } 
            } 
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => { clearTimeout(timerId); document.removeEventListener('keydown', handleKeyDown); if (prevActiveElement && typeof prevActiveElement.focus === 'function') { prevActiveElement.focus(); } };
    }, [isOpen, onClose, parallax.ref]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={onClose}
                    initial={{ backgroundColor: 'rgba(0,0,0,0)' }}
                    animate={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
                    exit={{ backgroundColor: 'rgba(0,0,0,0)' }}
                >
                    <motion.div 
                        ref={parallax.ref} 
                        style={parallax.style}
                        tabIndex={-1} 
                        className={`relative outline-none w-full max-w-sm flex flex-col modal-metallic ${activeVisualTheme.themeClass} ${customClasses}`} 
                        onClick={e => e.stopPropagation()} 
                        initial={{ scale: 0.95, opacity: 0, y: 50, filter: 'blur(20px)' }} 
                        animate={{ scale: 1, opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: "spring", stiffness: 120, damping: 18 } }} 
                        exit={{ scale: 0.95, opacity: 0, y: 50, filter: 'blur(20px)', transition: { duration: 0.2 } }} 
                        role="dialog" 
                        aria-modal="true" 
                        aria-live="polite"
                        aria-labelledby="modal-title"
                    >
                        <div className="modal-header">
                            {title && <h2 id="modal-title" className="modal-title text-3xl text-white">{title}</h2>}
                            <motion.button aria-label="Close modal" onClick={onClose} className="modal-close-button text-white/70 hover:text-white" whileTap={{scale: 0.9}} whileHover={{scale: 1.1}}><CloseIcon /></motion.button>
                        </div>
                        
                        <div className="modal-body">
                            {children}
                        </div>

                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const PromptModal = (props) => ( <Modal {...props} title={props.prompt.title}> <div className="modal-content-text">"{props.prompt.text}"</div> <div className="modal-footer flex flex-col space-y-4 pt-0"> <motion.button whileHover={{translateY: -1, scale: 1.02}} whileTap={{scale: 0.96}} transition={{duration: 0.15, ease: 'easeOut'}} onClick={() => { audioEngine.playCorrect(); props.onClose(); }} className="w-full btn btn--primary">Accept</motion.button> <motion.button whileHover={{translateY: -1, scale: 1.02}} whileTap={{scale: 0.96}} transition={{duration: 0.15, ease: 'easeOut'}} onClick={props.onRefuse} className="w-full btn btn--danger">Refuse</motion.button> </div> </Modal> );
const ConsequenceModal = (props) => ( <Modal {...props} customClasses="modal-consequence" title="The Price of Refusal!"><div className="modal-content-text"><span className="text-3xl" aria-label="Warning">⚠️</span> {props.text} <span className="text-3xl" aria-label="Warning">⚠️</span></div><div className="modal-footer pt-0"><motion.button whileHover={{translateY: -1, scale: 1.02}} whileTap={{scale: 0.96}} transition={{duration: 0.15, ease: 'easeOut'}} onClick={() => { audioEngine.playCorrect(); props.onClose(); }} className="w-full btn btn--danger">I Accept My Fate</motion.button></div></Modal> );
const ConfirmModal = (props) => ( <Modal {...props} title={props.title}><div className="modal-content-text">{props.message}</div><div className="modal-footer flex gap-4 pt-0"><motion.button whileHover={{translateY: -1, scale: 1.02}} whileTap={{scale: 0.96}} transition={{duration: 0.15, ease: 'easeOut'}} onClick={props.onClose} className="w-full btn btn--secondary">Cancel</motion.button><motion.button whileHover={{translateY: -1, scale: 1.02}} whileTap={{scale: 0.96}} transition={{duration: 0.15, ease: 'easeOut'}} onClick={() => { audioEngine.playCorrect(); props.onConfirm(); }} className="w-full btn btn--primary">Confirm</motion.button></div></Modal> );

const SettingsModal = ({ isOpen, onClose, settings, onSettingsChange, isMuted, onMuteToggle, onEditPrompts, onResetPrompts, onThemeChange, currentTheme, userId, onRestart, onQuit, activeVisualTheme, onReducedMotionToggle, reducedMotion }) => {
    const themes = [
        { id: 'velourNights', name: 'Velour Nights', grad: 'linear-gradient(135deg, #4c1d2f, #200f18)', chips: ['#FF6F91', '#B266FF', '#FFD700'] },
        { id: 'lotusDreamscape', name: 'Lotus Dreamscape', grad: 'linear-gradient(135deg, #2D2447, #191526)', chips: ['#FFB7FF', '#7AA2FF', '#E6E6FA'] },
        { id: 'velvetCarnival', name: 'Velvet Carnival', grad: 'linear-gradient(135deg, #6b2c00, #2e1100)', chips: ['#FF944D', '#FF4C5B', '#FFD700'] },
        { id: 'starlitAbyss', name: 'Starlit Abyss', grad: 'linear-gradient(135deg, #0A0C24, #0B0F2A)', chips: ['#8A2BE2', '#4169E1', '#A29BFE'] },
        { id: 'crimsonFrenzy', name: 'Crimson Frenzy', grad: 'linear-gradient(135deg, #4b0000, #1c0000)', chips: ['#FFD700', '#DC143C', '#FF4500'] }
    ];
    return ( <Modal isOpen={isOpen} onClose={onClose} title="Settings" activeVisualTheme={activeVisualTheme}>
        <div className="space-y-6 text-left text-sm">
            <div className="settings-section space-y-4">
                <h3 className="text-xl font-bold text-[var(--theme-label)]">Audio Settings</h3>
                <div>
                    <label className="font-bold text-white">👑 Master Volume</label>
                    <input type="range" min="0" max="100" value={settings.masterVolume} onChange={(e) => onSettingsChange({ masterVolume: parseInt(e.target.value) })} className="w-full" />
                </div>
                <div>
                    <label className="font-bold text-white">🎵 Music Volume</label>
                    <input type="range" min="0" max="100" value={settings.musicVolume} onChange={(e) => onSettingsChange({ musicVolume: parseInt(e.target.value) })} className="w-full" />
                </div>
                <div>
                    <label className="font-bold text-white">🔊 Effects Volume</label>
                    <input type="range" min="0" max="100" value={settings.sfxVolume} onChange={(e) => onSettingsChange({ sfxVolume: parseInt(e.target.value) })} className="w-full" />
                </div>
                <button onClick={onMuteToggle} className="w-full btn btn--secondary flex items-center justify-center gap-2"><SpeakerIcon muted={isMuted} />{isMuted ? 'Unmute All' : 'Mute All'}</button>
            </div>
            <div className="settings-section space-y-3">
                <h3 className="text-xl font-bold text-[var(--theme-label)]">Theme & Music</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {themes.map(theme => (
                        <div key={theme.id} onClick={() => onThemeChange(theme.id)} className={`theme-swatch ${currentTheme === theme.id ? 'ring-2 ring-[var(--theme-highlight)]' : ''}`} style={{'--swatch-grad': theme.grad}}>
                            <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{background: theme.grad}} />
                            <span className="font-bold text-xs">{theme.name}</span>
                            <div className="theme-chips ml-auto">
                               {theme.chips.map(c => <div key={c} className="theme-chip" style={{backgroundColor: c}}/>)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
             <div className="settings-section space-y-3">
                <h3 className="text-xl font-bold text-[var(--theme-label)]">Accessibility</h3>
                 <label className="flex items-center justify-between cursor-pointer">
                     <span className="font-bold text-white">Reduce Motion</span>
                     <div className="relative">
                         <input type="checkbox" className="sr-only" checked={reducedMotion} onChange={onReducedMotionToggle} />
                         <div className={`block w-12 h-6 rounded-full transition ${reducedMotion ? 'bg-[var(--theme-highlight)]' : 'bg-black/30'}`}></div>
                         <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${reducedMotion ? 'translate-x-6' : ''}`}></div>
                     </div>
                 </label>
            </div>
            <div className="settings-section space-y-3">
                <h3 className="text-xl font-bold text-[var(--theme-label)]">Game Management</h3>
                <button onClick={onEditPrompts} className={`w-full btn btn--primary flex items-center justify-center gap-2`}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>Customize Prompts</button>
                <button onClick={onResetPrompts} className="btn btn--inline w-full">Reset All Prompts to Defaults</button>
                <div className="flex gap-2 pt-2">
                    <button onClick={onRestart} className="btn btn--secondary w-full">Restart Game</button>
                    <button onClick={onQuit} className="btn btn--danger w-full">Quit Game</button>
                </div>
                {userId && <p className="text-[10px] text-center text-white/50 pt-2 break-all px-4">Session ID: {userId}</p>}
            </div>
        </div>
    </Modal> );
};

const EditorModal = ({ isOpen, onClose, prompts, onReset, activeVisualTheme }) => { const [category, setCategory] = useState('truthPrompts'); const [subCategory, setSubCategory] = useState('normal'); const [editorPrompts, setEditorPrompts] = useState(prompts); const [scrollState, setScrollState] = useState({ atTop: true, atBottom: false }); const scrollRef = useRef(null); const hasChanges = useMemo(() => JSON.stringify(editorPrompts) !== JSON.stringify(prompts), [editorPrompts, prompts]); const handleScroll = (e) => { const { scrollTop, scrollHeight, clientHeight } = e.target; setScrollState({ atTop: scrollTop < 5, atBottom: scrollHeight - scrollTop - clientHeight < 5 }); }; useEffect(() => { setEditorPrompts(prompts); }, [prompts, isOpen]); useEffect(() => { if (editorPrompts[category]) { const subKeys = Object.keys(editorPrompts[category]); if (subKeys.length > 0) { setSubCategory(subKeys[0]); } else { setSubCategory(null); } } }, [category, editorPrompts]); const handlePromptChange = (sub, index, value) => { const newPrompts = JSON.parse(JSON.stringify(editorPrompts)); newPrompts[category][sub][index] = value; setEditorPrompts(newPrompts); }; const handlePromptDelete = (sub, index) => { const newPrompts = JSON.parse(JSON.stringify(editorPrompts)); newPrompts[category][sub] = newPrompts[category][sub].filter((_, i) => i !== index); setEditorPrompts(newPrompts); }; const handleAddPrompt = (sub) => { audioEngine.playUIConfirm(); const newPrompts = JSON.parse(JSON.stringify(editorPrompts)); newPrompts[category][sub].push(''); setEditorPrompts(newPrompts); setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 50); }; const handleCloseAndSave = () => { onClose(hasChanges ? editorPrompts : null); }; const subCategoryKeys = ['truthPrompts', 'darePrompts', 'consequences']; const isCustomPrompt = (cat, sub, p) => !defaultPrompts[cat]?.[sub]?.includes(p); return ( <Modal isOpen={isOpen} onClose={() => onClose(null)} title="Customize Your Game" activeVisualTheme={activeVisualTheme}><div className="w-full flex flex-col text-left"><div className="flex border-b border-[var(--theme-highlight)]/30 mb-2 flex-shrink-0 overflow-x-auto pb-1">{Object.keys(prompts).map(key => (<button key={key} className={`py-2 px-4 font-bold text-sm whitespace-nowrap rounded-t-lg transition-colors ${category === key ? 'text-[var(--theme-label)]' : 'text-white/50 hover:text-white/80'}`} onClick={() => { audioEngine.playWheelTick(); setCategory(key); }}>{key.replace(/Prompts|Questions/g, '').toUpperCase()}</button>))}</div>{subCategory && subCategoryKeys.includes(category) && (<div className="flex border-b border-[var(--theme-highlight)]/20 mb-4 flex-shrink-0 overflow-x-auto pb-1">{Object.keys(editorPrompts[category]).map(subKey => (<button key={subKey} className={`py-1 px-3 text-xs font-semibold rounded-full mr-2 transition-colors ${subCategory === subKey ? 'bg-[var(--theme-highlight)] text-black' : 'bg-black/20 text-white/70 hover:bg-black/40'}`} onClick={() => { audioEngine.playWheelTick(); setSubCategory(subKey);}}>{subKey}</button>))}</div>)}<div className="space-y-6 relative editor-scroll-container" data-at-top={scrollState.atTop} data-at-bottom={scrollState.atBottom}><div ref={scrollRef} onScroll={handleScroll} className="editor-scroll-area">{editorPrompts[category] && (subCategoryKeys.includes(category) ? (subCategory && <div className="settings-section p-2 sm:p-4"><div className="space-y-2"><AnimatePresence initial={false}>{(editorPrompts[category][subCategory] || []).map((prompt, index) => (<motion.div key={`${category}-${subCategory}-${index}`} className="flex items-center space-x-3 bg-black/20 p-2 rounded-xl border border-white/10" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>{isCustomPrompt(category, subCategory, prompt) && <CustomPromptIcon />}<input type="text" value={prompt} onChange={(e) => handlePromptChange(subCategory, index, e.target.value)} className="w-full bg-transparent text-white placeholder-white/50 focus:outline-none p-1 font-['Inter',_sans-serif] text-sm" /><motion.button onClick={() => { audioEngine.playRefuse(); handlePromptDelete(subCategory, index); }} aria-label="Delete prompt" whileTap={{ scale: 0.8 }}><TrashIcon /></motion.button></motion.div>))}</AnimatePresence></div><button onClick={() => handleAddPrompt(subCategory)} className="btn btn--inline w-full mt-3 !py-2">+ Add Prompt</button></div>) : Object.entries(editorPrompts[category]).map(([group, list]) => (<div key={group} className="settings-section p-2 sm:p-4"><h3 className="text-lg font-bold text-[var(--theme-label)] capitalize mb-3 border-b border-[var(--theme-highlight)]/30 pb-1">{group}</h3><div className="space-y-2"><AnimatePresence initial={false}>{list.map((prompt, index) => (<motion.div key={`${category}-${group}-${index}`} className="flex items-center space-x-3 bg-black/20 p-2 rounded-xl border border-white/10" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>{isCustomPrompt(category, group, prompt) && <CustomPromptIcon />}<input type="text" value={prompt} onChange={(e) => handlePromptChange(group, index, e.target.value)} className="w-full bg-transparent text-white placeholder-white/50 focus:outline-none p-1 font-['Inter',_sans-serif] text-sm" /><motion.button onClick={() => { audioEngine.playRefuse(); handlePromptDelete(group, index); }} aria-label="Delete prompt" whileTap={{ scale: 0.8 }}><TrashIcon /></motion.button></motion.div>))}</AnimatePresence></div><button onClick={() => handleAddPrompt(group)} className="btn btn--inline w-full mt-3 !py-2">+ Add Prompt</button></div>)))}</div></div></div><div className="modal-footer mt-6 space-y-3"><button onClick={handleCloseAndSave} className="w-full btn btn--primary">{hasChanges ? "Save & Close" : "Close"}</button><button onClick={onReset} className="btn btn--inline w-full">Reset All to Defaults</button></div></Modal> ); };

const AudioUnlockScreen = ({ onUnlock, disabled, activeVisualTheme }) => ( <div className={`min-h-screen font-['Inter',_sans-serif] flex flex-col items-center justify-center p-4 overflow-hidden ${activeVisualTheme.themeClass}`}><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }} className="text-center"><motion.h1 className={`text-7xl md:text-8xl font-['Great_Vibes'] tracking-widest ${activeVisualTheme.titleText}`} style={{ filter: `drop-shadow(0 0 15px ${activeVisualTheme.titleShadow})` }}>Pulse</motion.h1><motion.p className="text-[#FFC0CB] text-lg md:text-xl mt-2 mb-12 italic" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.8 }}>A Game of Intimate Challenges</motion.p><motion.button onClick={onUnlock} disabled={disabled} className="relative btn btn--primary begin-button text-white font-bold py-4 px-12 text-2xl disabled:opacity-50 overflow-hidden" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 1.2, type: 'spring', stiffness: 120 }}><span className="relative z-10">Tap to Begin</span></motion.button>{disabled && (<p className="text-red-400 mt-4 text-sm">Could not load audio. Sound is disabled.</p>)}</motion.div></div> );
const OnboardingIntro = ({ onNext, activeVisualTheme }) => ( <div className={`min-h-screen w-full flex items-center justify-center font-['Inter',_sans-serif] ${activeVisualTheme.themeClass}`}><motion.div className="relative z-10 w-full max-w-md text-center p-4"><h2 className={`text-3xl sm:text-4xl font-bold mb-2 ${activeVisualTheme.titleText}`} style={{filter: `drop-shadow(0 0 10px ${activeVisualTheme.titleShadow})`}}>Set the Mood</h2><p className="text-white/80 mb-8">First, let's create the perfect atmosphere for your night.</p><motion.button onClick={onNext} className="w-full btn btn--primary font-bold py-3 px-4 rounded-full text-lg mt-4">Next</motion.button></motion.div></div>);
const OnboardingVibePicker = ({ onVibeSelect, activeVisualTheme, currentTheme }) => { const themes = [ { id: 'velourNights', name: 'Velour Nights' }, { id: 'lotusDreamscape', name: 'Lotus Dreamscape' }, { id: 'velvetCarnival', name: 'Velvet Carnival' }, { id: 'starlitAbyss', name: 'Starlit Abyss' }, { id: 'crimsonFrenzy', name: 'Crimson Frenzy' } ]; return ( <div className={`min-h-screen w-full flex items-center justify-center font-['Inter',_sans-serif] ${activeVisualTheme.themeClass}`}><motion.div className="relative z-10 w-full max-w-md text-center p-4"><h2 className={`text-3xl sm:text-4xl font-bold mb-8 ${activeVisualTheme.titleText}`} style={{filter: `drop-shadow(0 0 10px ${activeVisualTheme.titleShadow})`}}>Pick Your Vibe</h2><div className="grid grid-cols-1 gap-3">{themes.map(theme => ( <button key={theme.id} onClick={() => onVibeSelect(theme.id)} className={`theme-swatch text-left ${currentTheme === theme.id ? 'ring-2 ring-[var(--theme-highlight)]' : ''}`} > <span className="font-bold text-sm">{theme.name}</span> </button> ))}</div></motion.div></div> );};
const PlayerNameScreen = ({ onStart, activeVisualTheme }) => { const [p1, setP1] = useState(''); const [p2, setP2] = useState(''); const handleSubmit = (e) => { e.preventDefault(); onStart({ p1: p1 || 'Player 1', p2: p2 || 'Player 2' }); }; return ( <div className={`min-h-screen w-full flex items-center justify-center font-['Inter',_sans-serif] ${activeVisualTheme.themeClass}`}><motion.div className="relative z-10 w-full max-w-md text-center p-4"><h2 className={`text-3xl sm:text-4xl font-bold mb-8 ${activeVisualTheme.titleText}`} style={{filter: `drop-shadow(0 0 10px ${activeVisualTheme.titleShadow})`}}>Who's feeling the Pulse?</h2><form onSubmit={handleSubmit} className="flex flex-col gap-6"><div className="metallic-input-wrapper p-1"><input type="text" value={p1} onChange={e => setP1(e.target.value)} placeholder="Player 1 Name..." className="w-full text-white p-3 rounded-full text-center placeholder:text-white/50 focus:outline-none" /></div><div className="metallic-input-wrapper p-1"><input type="text" value={p2} onChange={e => setP2(e.target.value)} placeholder="Player 2 Name..." className="w-full text-white p-3 rounded-full text-center placeholder:text-white/50 focus:outline-none" /></div><motion.button type="submit" className="w-full btn btn--primary font-bold py-3 px-4 rounded-full text-lg mt-4">Start Game</motion.button></form></motion.div></div> ); };
const TurnBanner = ({ playerName }) => ( <motion.div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[120] pointer-events-none bg-black/50 backdrop-blur-md border border-[var(--theme-highlight)] shadow-xl px-8 py-3 rounded-full" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20, transition: { delay: 2.5, duration: 0.3 } }}><h2 className="text-xl sm:text-2xl font-bold tracking-wide text-[var(--theme-highlight)]">It's {playerName}'s turn!</h2></motion.div> );
const ExtremeIntroEffect = ({ theme, reducedMotion }) => { if (reducedMotion) { return <div className={`fixed inset-0 z-[125] pointer-events-none extreme-effect-bg ${theme}`} />; } const variants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.5 } }, exit: { opacity: 0, transition: { duration: 2, delay: 1 } } }; return ( <motion.div key={theme} variants={variants} initial="hidden" animate="visible" exit="exit" className={`fixed inset-0 z-[125] pointer-events-none overflow-hidden extreme-effect-bg ${theme}`}> {theme === 'crimsonFrenzy' && <div className="extreme-scanlines" />} {theme === 'velvetCarnival' && <div className="extreme-neon-edge" />} </motion.div> );};
const ExtremeIntroModal = (props) => ( <Modal {...props} title="🔥 EXTREME ROUND! 🔥"><div className="modal-content-text"><p className="mb-2 font-['Inter',_sans-serif] text-lg leading-relaxed text-white/90">This is an Extreme Only round!</p><p className="leading-relaxed text-white">Only the most intense truths, dares, and consequences are available. Good luck!</p></div><div className="modal-footer pt-0"><motion.button whileHover={{translateY: -1, scale: 1.02}} whileTap={{scale: 0.96}} transition={{duration: 0.15, ease: 'easeOut'}} onClick={props.onClose} className="w-full btn btn--primary py-3 px-4 rounded-full text-lg">I'm Ready</motion.button></div></Modal> );
const NoiseOverlay = ({ reducedMotion }) => ( <div className={`fixed inset-0 z-10 opacity-[0.03] pointer-events-none ${reducedMotion ? '' : 'noise-animated'}`} /> );
const Vignette = () => <div className="fixed inset-0 z-10 pointer-events-none vignette-overlay"></div>;
const PowerSurgeEffect = ({ onComplete, reducedMotion }) => ( <motion.div className="fixed inset-0 z-[130] pointer-events-none bg-power-surge" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: [0, 0.8, 0], scale: [0, 1.2, 1.5] }} transition={{ duration: reducedMotion ? 0 : 0.8, ease: "easeOut" }} onAnimationComplete={onComplete} /> );

const RadialLighting = ({ reducedMotion }) => {
    const lightRef = useRef(null);
    useEffect(() => {
        if (reducedMotion) return;
        const el = lightRef.current;
        if (!el) return;

        const handlePointerMove = (e) => {
            const { clientX, clientY } = e.touches ? e.touches[0] : e;
            el.style.setProperty('--light-x', `${clientX}px`);
            el.style.setProperty('--light-y', `${clientY}px`);
        };
        
        window.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('touchmove', handlePointerMove);

        return () => {
            window.removeEventListener('mousemove', handlePointerMove);
            window.removeEventListener('touchmove', handlePointerMove);
        }
    }, [reducedMotion]);

    if (reducedMotion) return null;
    return <div ref={lightRef} className="radial-light-overlay" />
};

function App() {
    const { prompts, updatePrompts, isLoading, userId } = useFirestorePrompts();
    const [scriptLoadState, setScriptLoadState] = useState('loading');
    const [isUnlockingAudio, setIsUnlockingAudio] = useState(false);
    const [modalState, setModalState] = useState({ type: null, data: {} });
    const [currentTheme, setCurrentTheme] = useState('velourNights');
    const [backgroundTheme, setBackgroundTheme] = useState('velourNights');
    const [activeBg, setActiveBg] = useState(1);
    const [settings, setSettings] = useState({ masterVolume: 100, musicVolume: 80, sfxVolume: 100 });
    const [isMuted, setIsMuted] = useState(false);
    const [pulseLevel, setPulseLevel] = useState(0);
    const [showPowerSurge, setShowPowerSurge] = useState(false);
    const [roundCount, setRoundCount] = useState(0);
    const [isExtremeMode, setIsExtremeMode] = useState(false);
    const [extremeRoundSource, setExtremeRoundSource] = useState(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [confettiOrigin, setConfettiOrigin] = useState({x: 0.5, y: 0.5 });
    const [isSpinInProgress, setIsSpinInProgress] = useState(false);
    const [pendingExtremeRound, setPendingExtremeRound] = useState(null);
    const [audioInitFailed, setAudioInitFailed] = useState(false);
    const [gameState, setGameState] = useState('unlock'); // unlock, onboarding_intro, onboarding_vibe, enterNames, turnIntro, playing
    const [players, setPlayers] = useState({ p1: 'Player 1', p2: 'Player 2' });
    const [currentPlayer, setCurrentPlayer] = useState('p1');
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
    const [recentPrompts, setRecentPrompts] = useState({ truth: [], dare: [], trivia: [] });
    const mainContentRef = useRef(null);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
        handleChange(); // Set initial state
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // Debug helper and spin state watchdog
    useEffect(() => {
        window.debugReset = () => {
            setIsSpinInProgress(false);
            setModalState({ type: null, data: {} });
            console.log('Force reset game modal/spin state');
        };

        const watchdog = setInterval(() => {
            if (window.debugReset && isSpinInProgress && !document.querySelector('.spin-button:disabled')) {
                 const isSpinningVisually = (!!document.querySelector('.spin-button svg.animate-spin'));
                 if(!isSpinningVisually) {
                    console.warn('Watchdog: Detected spin state desync. Resetting.');
                    window.debugReset();
                 }
            }
        }, 2000);

        return () => {
            delete window.debugReset;
            clearInterval(watchdog);
        }
    }, [isSpinInProgress]);

    // Failsafe to clean up modal state if animation/unmount glitches
    useEffect(() => {
        if (modalState.type && gameState === 'playing') {
            const resetTimer = setTimeout(() => {
                if (modalState.type && !document.querySelector('[role="dialog"]')) {
                    console.warn("Failsafe: Resetting stale modal state.");
                    setModalState({ type: null, data: {} });
                }
            }, 1200);
            return () => clearTimeout(resetTimer);
        }
    }, [modalState.type, gameState]);

    
    useEffect(() => {
        let timer;
        if (gameState === 'turnIntro') {
            timer = setTimeout(() => {
                setGameState('playing');
            }, 2800);
        }
        return () => clearTimeout(timer);
    }, [gameState]);

    const safeOpenModal = useCallback((type, data = {}) => {
        setModalState(current => {
            if (current.type) {
                console.warn(`Modal race condition blocked: Tried to open '${type}' while '${current.type}' was active.`);
                return current;
            }
            return { type, data };
        });
    }, []);

    const visualThemes = {
        velourNights: { bg: 'theme-velour-nights-bg', titleText: 'text-white', titleShadow: '#F777B6', themeClass: 'theme-velour-nights' },
        lotusDreamscape: { bg: 'theme-lotus-dreamscape-bg', titleText: 'text-white', titleShadow: '#F777B6', themeClass: 'theme-lotus-dreamscape' },
        velvetCarnival: { bg: 'theme-velvet-carnival-bg', titleText: 'text-white', titleShadow: '#FFD700', themeClass: 'theme-velvet-carnival' },
        starlitAbyss: { bg: 'theme-starlit-abyss-bg', titleText: 'text-white', titleShadow: '#8A2BE2', themeClass: 'theme-starlit-abyss' },
        crimsonFrenzy: { bg: 'theme-crimson-frenzy-bg', titleText: 'text-white', titleShadow: '#ff0000', themeClass: 'theme-crimson-frenzy' }
    };

    const activeVisualTheme = visualThemes[backgroundTheme] || visualThemes.velourNights;
    const activeBackgroundClass = visualThemes[backgroundTheme]?.bg || visualThemes.velourNights.bg;

    useEffect(() => { 
        if (window.Tone) { 
            setScriptLoadState('loaded'); 
            return; 
        } 
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/tone@14.7.77/build/Tone.min.js";
        script.async = true;
        script.onload = () => {
            if (window.Tone) setScriptLoadState('loaded');
        };
        script.onerror = () => setScriptLoadState('error');
        document.body.appendChild(script);
        return () => { if (script.parentNode) script.parentNode.removeChild(script); };
    }, []);

    useEffect(() => { 
        if (modalState.type && modalState.type !== 'settings' && modalState.type !== 'editor' ) { 
            audioEngine.playModalOpen(); 
        } 
    }, [modalState.type]);
    
    useEffect(() => { const convertToDb = (v) => (v === 0 ? -Infinity : (v / 100) * 40 - 40); audioEngine.setMasterVolume(convertToDb(settings.masterVolume)); audioEngine.setMusicVolume(convertToDb(settings.musicVolume)); audioEngine.setSfxVolume(convertToDb(settings.sfxVolume)); }, [settings]);
    useEffect(() => { audioEngine.toggleMute(isMuted); }, [isMuted]);
    
    useEffect(() => {
        const themeToSet = isExtremeMode ? 'crimsonFrenzy' : currentTheme;
        if (themeToSet !== backgroundTheme) {
            setActiveBg(prev => prev === 1 ? 2 : 1);
            setBackgroundTheme(themeToSet);
        }
    }, [isExtremeMode, currentTheme, backgroundTheme]);


    const handleThemeChange = useCallback((themeId) => {
        if (currentTheme !== themeId) {
            setCurrentTheme(themeId);
            audioEngine.startTheme(themeId);
        }
    }, [currentTheme]);

    const triggerExtremeRound = useCallback((source) => {
        const wheelEl = mainContentRef.current?.querySelector('.spin-button');
        if (wheelEl) {
            const rect = wheelEl.getBoundingClientRect();
            const originX = (rect.left + rect.width / 2) / window.innerWidth;
            const originY = (rect.top + rect.height / 2) / window.innerHeight;
            setConfettiOrigin({ x: originX, y: originY });
        }
        setShowPowerSurge(true);
        audioEngine.playExtremePrompt();
        audioEngine.startTheme('crimsonFrenzy');
        setShowConfetti(true);
        setExtremeRoundSource(source);
        safeOpenModal('extremeIntro');
    }, [safeOpenModal]);

    useEffect(() => { 
        if (!isSpinInProgress && !modalState.type && pendingExtremeRound) { 
            triggerExtremeRound(pendingExtremeRound); 
            setPendingExtremeRound(null); 
        } 
    }, [isSpinInProgress, modalState.type, pendingExtremeRound, triggerExtremeRound]);
    
    const handleUnlockAudio = useCallback(async () => {
        if (scriptLoadState !== 'loaded' || isUnlockingAudio) {
            if (scriptLoadState !== 'loaded') setAudioInitFailed(true);
            setGameState('onboarding_intro');
            return;
        }
        setIsUnlockingAudio(true);
        try {
            // ✅ Must be called inside a click/tap gesture
            await window.Tone.start();

            // Initialize the engine now that the context is running
            const success = await audioEngine.initialize();
            
            if (success) {
                // Start the default theme safely
                audioEngine.startTheme("velourNights");
            } else {
                 setAudioInitFailed(true);
            }
        } catch (err) {
            console.error("Audio init failed:", err);
            setAudioInitFailed(true);
        }
        setGameState('onboarding_intro');
        setIsUnlockingAudio(false);
    }, [scriptLoadState, isUnlockingAudio, setGameState, setIsUnlockingAudio, setAudioInitFailed]);

    const handleNameEntry = useCallback((playerNames) => { 
        setPlayers(playerNames); 
        setGameState('turnIntro'); 
    }, []);

    const handleToggleMute = useCallback(() => setIsMuted(prev => !prev), []);

    const endRoundAndStartNew = useCallback(() => {
        if (isExtremeMode) {
            setIsExtremeMode(false);
            setExtremeRoundSource(null);
            audioEngine.startTheme(currentTheme);
        }

        const newRoundCount = roundCount + 1;
        setRoundCount(newRoundCount);
        setCurrentPlayer(prev => (prev === 'p1' ? 'p2' : 'p1'));
        setGameState('turnIntro');
        let increment = 5;
        if (newRoundCount > 10) {
            increment = 20;
        } else if (newRoundCount > 5) {
            increment = 10;
        }
        
        const newPulseLevel = Math.min(pulseLevel + increment, 100);

        if (newPulseLevel >= 100 && !isExtremeMode) {
             setPendingExtremeRound('spark');
             setPulseLevel(100); // Set to 100 to show full meter before extreme round starts
        } else {
            setPulseLevel(newPulseLevel);
        }
    
        if (!isExtremeMode && newPulseLevel < 100 && Math.random() < 0.1) { // Reduced random chance slightly
            if (isSpinInProgress || modalState.type) {
                setPendingExtremeRound('random');
            } else {
                triggerExtremeRound('random');
            }
        }
    }, [isExtremeMode, roundCount, pulseLevel, isSpinInProgress, modalState.type, triggerExtremeRound, currentTheme]);

    const handleCloseModal = useCallback(() => { 
        audioEngine.playModalClose(); 
        setModalState({ type: null, data: {} }); 
    }, []);

    const handlePromptModalClose = useCallback(() => {
        handleCloseModal();
        endRoundAndStartNew();
    }, [handleCloseModal, endRoundAndStartNew]);

    const handleConsequenceClose = useCallback(() => {
        handleCloseModal();
        endRoundAndStartNew();
    }, [handleCloseModal, endRoundAndStartNew]);

    const handleExtremeIntroClose = useCallback(() => { 
        setModalState({ type: null, data: {} }); 
        setIsExtremeMode(true); 
        if (extremeRoundSource === 'spark' && (roundCount + 1) % 5 === 0) {
            setTimeout(() => setPulseLevel(0), 1000);
        }
    }, [extremeRoundSource, roundCount]);

    const pickPrompt = useCallback((category, list) => {
        const recent = recentPrompts[category] || [];
        const available = list.filter(p => !recent.includes(p));
        const choice = available.length > 0 ? available[Math.floor(Math.random() * available.length)] : list[Math.floor(Math.random() * list.length)] || 'No prompts available.';
        setRecentPrompts(prev => ({ ...prev, [category]: [...recent.slice(-4), choice] }));
        return choice;
    }, [recentPrompts]);
    
    const handleSpinFinish = useCallback((category) => {
        const { truthPrompts, darePrompts, triviaQuestions } = prompts;
        const list = category === 'truth' ? (isExtremeMode ? truthPrompts.extreme : [...truthPrompts.normal, ...truthPrompts.spicy]) : category === 'dare' ? (isExtremeMode ? darePrompts.extreme : [...darePrompts.normal, ...darePrompts.spicy]) : [...triviaQuestions.normal];
        const validList = list.filter(p => typeof p === 'string' && p.trim() !== '');
        const text = pickPrompt(category, validList);
        const title = { truth: 'The Velvet Truth...', dare: 'The Royal Dare!', trivia: 'The Trivia Challenge' }[category] || 'Your Challenge';
        
        // Failsafe state reset
        setTimeout(() => {
            safeOpenModal('prompt', { title, text });
            setIsSpinInProgress(false);
        }, 600); // Delay to allow pointer settle animation
    }, [prompts, isExtremeMode, pickPrompt, safeOpenModal]);

    const handleRefuse = useCallback(() => { 
        audioEngine.playRefuse();
        setModalState(prev => ({...prev, type: null})); // Close prompt modal
        
        const list = isExtremeMode ? [...(prompts.consequences.extreme || [])] : [...(prompts.consequences.normal || []), ...(prompts.consequences.spicy || [])]; 
        const filteredList = list.filter(c => c && c.trim() !== ''); 
        const text = filteredList.length > 0 ? filteredList[Math.floor(Math.random() * filteredList.length)] : "Add consequences in the editor!"; 
        
        // Use a timeout to ensure the state update has processed before opening the next modal
        setTimeout(() => {
            safeOpenModal('consequence', { text });
        }, 50);
    }, [isExtremeMode, prompts, safeOpenModal]);

    const handleEditorClose = useCallback((updatedPrompts) => { 
        if (updatedPrompts) { 
            audioEngine.playCorrect(); 
            updatePrompts(updatedPrompts); 
        }
        if (modalState.data?.from === 'settings') {
             setModalState({ type: 'settings' });
        } else {
             handleCloseModal();
        }
    }, [updatePrompts, modalState.data, handleCloseModal]);

    const handleConfirmReset = useCallback(() => { 
        audioEngine.playRefuse(); 
        updatePrompts(defaultPrompts); 
        setModalState({ type: 'editor', data: { from: 'settings' } }); 
    }, [updatePrompts]);

    const handleRestartGame = useCallback(() => {
        setPulseLevel(0);
        setRoundCount(0);
        setPlayers({ p1: 'Player 1', p2: 'Player 2' });
        setCurrentPlayer('p1');
        setIsExtremeMode(false);
        setModalState({ type: null });
        setGameState('onboarding_intro');
    }, []);

    const handleQuitGame = useCallback(() => {
        handleRestartGame();
        setGameState('unlock');
    }, [handleRestartGame]);
    
    const renderContent = () => {
        const onboardingProps = { activeVisualTheme };
        const motionProps = {
            className: "w-full h-full absolute inset-0",
            initial: { x: '100%', opacity: 0 },
            animate: { x: 0, opacity: 1 },
            exit: { x: '-100%', opacity: 0 },
            transition: { duration: 0.4, ease: 'easeInOut' }
        };

        if (isLoading) { return <div className="flex items-center justify-center h-screen"><p className="text-[#FFD700] text-3xl font-['Great_Vibes'] animate-pulse">Setting the Mood...</p></div>; }
        
        return (
            <AnimatePresence mode="wait" initial={false}>
                {gameState === 'unlock' && <motion.div key="unlock"><AudioUnlockScreen onUnlock={handleUnlockAudio} disabled={scriptLoadState !== 'loaded' || isUnlockingAudio} {...onboardingProps} /></motion.div>}
                {gameState === 'onboarding_intro' && <motion.div key="onboarding_intro" {...motionProps}><OnboardingIntro onNext={() => setGameState('onboarding_vibe')} {...onboardingProps} /></motion.div>}
                {gameState === 'onboarding_vibe' && <motion.div key="onboarding_vibe" {...motionProps}><OnboardingVibePicker currentTheme={currentTheme} onVibeSelect={(theme) => { handleThemeChange(theme); setGameState('enterNames'); }} {...onboardingProps} /></motion.div>}
                {gameState === 'enterNames' && <motion.div key="enterNames" {...motionProps}><PlayerNameScreen onStart={handleNameEntry} {...onboardingProps} /></motion.div>}
                {(gameState === 'playing' || gameState === 'turnIntro') && (
                    <motion.div key="playing" initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} transition={{duration: 0.5}}>
                        <div ref={mainContentRef} className='w-full h-full z-[60] flex flex-col'>
                            <header className="relative w-full flex justify-center items-center p-4 pt-6 shrink-0">
                                <h1 className={`text-6xl ${activeVisualTheme.titleText} font-['Great_Vibes']`} style={{ filter: `drop-shadow(0 0 15px ${activeVisualTheme.titleShadow})` }}>Pulse</h1>
                                <motion.button onClick={() => { audioEngine.playUIConfirm(); setModalState({ type: 'settings' }); }} className="absolute top-6 right-4 text-[#FFD700] hover:text-yellow-300 bg-black/20 backdrop-blur-md border border-white/10 p-3 rounded-full shadow-lg" whileTap={{ scale: 0.9, rotate: -15 }} whileHover={{ scale: 1.15, rotate: 15, boxShadow: '0 0 25px var(--theme-highlight)' }} aria-label="Settings">
                                    <SettingsIcon />
                                </motion.button>
                            </header>
                            <main className="w-full flex-grow flex flex-col items-center justify-center px-4" style={{ perspective: "1000px" }}>
                                <div className="relative w-[min(85vw,380px)] sm:w-[min(55vh,420px)] aspect-square mt-[clamp(2rem,8vh,5rem)]">
                                    <Wheel onSpinFinish={handleSpinFinish} playWheelSpinStart={audioEngine.playWheelSpinStart} playWheelTick={audioEngine.playWheelTick} playWheelStop={audioEngine.playWheelStopSound} setIsSpinInProgress={setIsSpinInProgress} currentTheme={backgroundTheme} canSpin={!modalState.type && gameState === 'playing' && !isSpinInProgress} reducedMotion={prefersReducedMotion} />
                                </div>
                            </main>
                            <footer className="w-full p-4 flex flex-col items-center shrink-0 mb-[clamp(2rem,8vh,5rem)]">
                                <div className="w-full max-w-md">
                                    <PulseMeter level={pulseLevel} bpm={audioEngine.getCurrentBpm()} />
                                </div>
                            </footer>
                            {audioInitFailed && (<div className="fixed bottom-24 right-4 z-[60] bg-red-900/50 text-white text-xs px-3 py-1 rounded-full border border-red-500 backdrop-blur-sm">Audio failed to initialize.</div>)}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        );
    }

    return (
        <div id="app-container" className={`min-h-screen font-['Inter',_sans-serif] text-white flex flex-col items-center overflow-hidden relative ${prefersReducedMotion ? 'reduced-motion' : ''}`} style={{'--pulse-glow-intensity': `${pulseLevel / 100}`, '--beat-duration': `${60 / audioEngine.getCurrentBpm()}s`}}>
            <style>{`
                /* ==============================================
                Z-INDEX HIERARCHY
                ==============================================
                -1  : Background Layers
                10  : Noise Overlay, Vignette, Radial Lighting
                15  : HDR Glow, Aurora Reflect
                40  : Particle Background
                60  : Main Game UI (Wheel, Pulse Meter)
                100 : Confetti Effect
                110 : Modals
                120 : Turn Banner
                125 : Extreme Intro Effect BG
                130 : Power Surge Effect
                ==============================================
                */
                :root { --fluid-fs: clamp(14px, 1.5vw + 1vh, 18px); }
                .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0; }
                @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&family=Inter:wght@400..900&display=swap');
                body { font-family: 'Inter', sans-serif; color: white; margin: 0; background-color: #000; font-size: var(--fluid-fs); }
                @keyframes ripple-glow { 0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.7; } 100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; } }
                @keyframes background-pan { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
                @keyframes noise-pan { 0% { transform: translate(0, 0); } 10% { transform: translate(-5%, -10%); } 20% { transform: translate(-15%, 5%); } 30% { transform: translate(7%, -25%); } 40% { transform: translate(-5%, 25%); } 50% { transform: translate(-15%, 10%); } 60% { transform: translate(15%, 0%); } 70% { transform: translate(0%, 15%); } 80% { transform: translate(-5%, 5%); } 90% { transform: translate(10%, -20%); } 100% { transform: translate(0, 0); } }
                @keyframes modal-title-shimmer { from { background-position: -150px 0; } to { background-position: 150px 0; } }
                @keyframes meter-breath { 0% { filter: brightness(1) drop-shadow(0 0 4px var(--meter-stop-3)); } 50% { filter: brightness(1.2) drop-shadow(0 0 10px var(--meter-stop-3)); } 100% { filter: brightness(1) drop-shadow(0 0 4px var(--meter-stop-3)); } }
                @keyframes glitch { 2%, 64% { transform: translate(2px, 0) skew(0deg); } 4%, 60% { transform: translate(-2px, 0) skew(0deg); } 62% { transform: translate(0, 0) skew(5deg); } }
                @keyframes aurora { from { background-position: 0% 50%; } to { background-position: 200% 50%; } }
                @keyframes neon-flicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
                @keyframes ripple { from { transform: scale(0); opacity: 1; } to { transform: scale(1); opacity: 0; } }
                @keyframes wave-move { from { background-position-x: 0; } to { background-position-x: -200px; } }
                @keyframes shimmer-pulse { 0%,100% { opacity:0.4; transform: translate(--50%, -50%) scale(1);} 50% { opacity:0.8; transform: translate(-50%, -50%) scale(1.05);} }
                @keyframes pulse-sync { 0%,100% { filter: blur(5px); opacity: .5; } 50% { filter: blur(10px); opacity: 1; } }
                @keyframes hue-shift { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }

                .wheel-container { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; transform-style: preserve-3d; }
                .wheel-canvas { position: relative; width: 100%; height: 100%; border-radius: 50%; box-shadow: 0 8px 40px rgba(0,0,0,0.35); }
                .wheel-canvas::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle at 25% 25%, rgba(255,255,255,0.2), transparent 70%); mix-blend-mode: overlay; pointer-events: none; }
                .wheel-shimmer { position:absolute; top:50%; left:50%; width:100%; height:100%; border-radius:50%; background:radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 40%); pointer-events:none; z-index:15; animation:shimmer-pulse 2.5s ease-in-out infinite; }
                .hub { position: absolute; width: 25%; height: 25%; display: flex; align-items: center; justify-content: center; transform-style: preserve-3d; }
                .pointer { position: absolute; top: -15px; left: 50%; transform: translateX(-50%); z-index: 10; filter: drop-shadow(0 4px 3px rgba(0,0,0,0.5)) drop-shadow(0 0 8px var(--theme-highlight, #FFD700)); transition: filter 0.3s ease; transform-origin: 50% 100%; }
                .pointer-tip-outer { width: 44px; height: 35px; clip-path: polygon(50% 100%, 0 0, 100% 0); background: linear-gradient(to bottom, #FFD700, #D4AF37); padding: 2px; }
                .pointer-tip-inner { width: 100%; height: 100%; clip-path: polygon(50% 100%, 0 0, 100% 0); background: linear-gradient(to bottom, #FCE9A0, #E6C468); position: relative; }
                .pointer-tip-inner::before { content: ''; position: absolute; top: 1px; left: 5px; right: 5px; height: 1px; background: rgba(255,255,255,0.7); }

                .metallic-input-wrapper { background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); box-shadow: inset 1px 1px 2px rgba(255,255,255,0.15), inset -1px -1px 2px rgba(0,0,0,0.25); border-radius: 24px; transition: all 0.3s ease; }
                .metallic-input-wrapper:focus-within { border-color: var(--theme-highlight); box-shadow: 0 0 20px -5px var(--theme-highlight), inset 1px 1px 2px rgba(255,255,255,0.15), inset -1px -1px 2px rgba(0,0,0,0.25); }
                .metallic-input-wrapper input { background: transparent; box-shadow: none; text-shadow: none; font-weight: 700; }
                .metallic-input-wrapper input::placeholder { color: var(--theme-base); opacity: 0.6; text-shadow: none; font-weight: 400; }
                
                .theme-velour-nights { --theme-highlight:#FFD700; --theme-base:#D4AF37; --theme-shadow:#7A5C00; --theme-label:#FFD700; --meter-stop-0:#9b59b6; --meter-stop-1:#D4AF37; --meter-stop-2:#FFD700; --meter-stop-3:#F777B6; --wave-glow-color: #F777B6;}
                .theme-lotus-dreamscape{ --theme-highlight:#E6E6FA; --theme-base:#C0C0C0; --theme-shadow:#5A5A7A; --theme-label:#E6E6FA; --meter-stop-0:#6A5ACD; --meter-stop-1:#9AA4FF; --meter-stop-2:#C0C0C0; --meter-stop-3:#E6E6FA; --wave-glow-color: #ADD8E6;}
                .theme-velvet-carnival{ --theme-highlight:#FF944D; --theme-base:#FF4500; --theme-shadow:#662200; --theme-label:#FFD700; --meter-stop-0:#FF7F50; --meter-stop-1:#FFA559; --meter-stop-2:#FFD700; --meter-stop-3:#FF4500; --wave-glow-color: #FFD700;}
                .theme-starlit-abyss { --theme-highlight:rgba(224,255,255,0.8); --theme-base:#8A2BE2; --theme-shadow:#1C1030; --theme-label:#E0FFFF; --meter-stop-0:#4B5D9A; --meter-stop-1:#6C5CE7; --meter-stop-2:#8A2BE2; --meter-stop-3:rgba(224,255,255,0.7); --wave-glow-color: #C792EA;}
                .theme-crimson-frenzy{ --theme-highlight:#FFD700; --theme-base:#DC143C; --theme-shadow:#3D0000; --theme-label:#FFD700; --meter-stop-0:#F08080; --meter-stop-1:#DC143C; --meter-stop-2:#FF6F91; --meter-stop-3:#FFD700; --wave-glow-color: #FF4500;}

                .btn{ --btn-text:#fff; --btn-edge:rgba(255,255,255,0.08); --btn-gloss:rgba(255,255,255,0.75); --btn-shadow:rgba(0,0,0,0.55); border:0; border-radius:9999px; padding:.9rem 1.25rem; font-weight:800; letter-spacing:.02em; cursor:pointer; transition: transform 0.15s ease-out, box-shadow 0.15s ease-out, filter 0.15s ease-out; outline:none; position:relative; min-height:44px; }
                .btn:focus-visible{ box-shadow:0 0 0 2px var(--theme-highlight), inset 1px 1px 2px rgba(255,255,255,0.15), inset -1px -1px 2px rgba(0,0,0,0.25); }
                .btn--primary{ background:radial-gradient(circle at 50% 38%, var(--theme-highlight), var(--theme-base) 90%); box-shadow: inset 0 2px 3px var(--btn-gloss), 0 14px 28px var(--btn-shadow); }
                .btn--primary:hover:not(:disabled){ box-shadow: inset 0 2px 3px var(--btn-gloss), 0 18px 36px var(--btn-shadow); }
                .btn--primary:active:not(:disabled){ box-shadow: inset 0 10px 18px rgba(0,0,0,.6); }
                .btn--secondary{ background:rgba(255,255,255,0.08); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.2); box-shadow:inset 0 1px 2px rgba(255,255,255,.08), 0 8px 18px rgba(0,0,0,.35); color:var(--theme-label); }
                .btn--secondary:hover:not(:disabled){ box-shadow:0 12px 28px rgba(0,0,0,.4), 0 0 18px -6px var(--theme-highlight); }
                .btn--danger{ color: white; background:radial-gradient(circle at 50% 40%, #FF889A, #D91E36 90%); box-shadow: inset 0 2px 3px var(--btn-gloss), 0 14px 28px rgba(139,0,0,.6); }
                .btn--danger:hover:not(:disabled) { box-shadow: inset 0 2px 3px var(--btn-gloss), 0 18px 36px var(--btn-shadow); }
                .btn--danger:active:not(:disabled) { box-shadow: inset 0 10px 18px rgba(0,0,0,.6); }
                .btn--inline{ padding:.5rem .9rem; font-weight:700; border-radius:9999px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color: var(--theme-label); text-align:center;}
                .btn--inline:hover{ filter:brightness(1.1); box-shadow: 0 0 8px -4px var(--theme-highlight); }

                .modal-close-button{ min-width:44px; min-height:44px; padding:6px; position: absolute; top: .5rem; right: .5rem; display:flex; align-items:center; justify-content:center; border-radius: 50%; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); z-index: 20; cursor: pointer; backdrop-filter: blur(5px); }
                .modal-close-button:hover{ filter: drop-shadow(0 0 5px var(--theme-highlight)); }
                .modal-metallic{ position:relative; overflow:hidden; background-clip: padding-box; border-radius:24px; border:1px solid rgba(255,255,255,.12); background:linear-gradient(180deg, rgba(15,10,20,.8), rgba(10,6,16,.65)); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); box-shadow:0 24px 60px rgba(0,0,0,.5); }
                .modal-metallic::before{ content:''; position:absolute; inset:0; border-radius:inherit; background: linear-gradient(to bottom, rgba(255,255,255,0.04), rgba(255,255,255,0.02) 40%, transparent 80%); pointer-events:none; }
                .modal-header{ display:flex; align-items:center; justify-content:center; padding:1rem 1rem 0; text-align: center; }
                .modal-title{ font-weight:900; letter-spacing:.02em; position:relative; padding-bottom: 1rem;}
                .modal-title::after{ content:''; display:block; height:3px; width:120px; margin:.4rem auto 0; border-radius:9999px; background:linear-gradient(90deg, transparent, white, transparent); animation: modal-title-shimmer 1s ease-in-out; }
                .modal-body{ max-height:min(70vh, 560px); overflow:auto; padding:1rem; text-align: center; }
                .modal-content-text { text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
                .modal-footer{ position:sticky; bottom:0; padding:1rem 1rem 1rem; background:linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.25)); backdrop-filter:blur(10px); }
                
                .editor-scroll-container::before, .editor-scroll-container::after { content:''; position:absolute; left:0; right:0; height:30px; z-index:1; pointer-events:none; transition: opacity .2s ease; }
                .editor-scroll-container::before { top:0; background:linear-gradient(to bottom, rgba(10,6,16,1), transparent); }
                .editor-scroll-container::after { bottom:0; background:linear-gradient(to top, rgba(10,6,16,1), transparent); }
                .editor-scroll-container[data-at-top="true"]::before { opacity:0; }
                .editor-scroll-container[data-at-bottom="true"]::after { opacity:0; }
                .editor-scroll-area { max-height: 45vh; overflow-y: auto; padding-right: 8px; }

                .settings-section{ background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,.1); border-radius:16px; padding:16px; }
                .theme-swatch{ display:flex; gap:8px; align-items:center; padding:10px; border-radius:14px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.05); cursor:pointer; transition:transform .15s ease, box-shadow .15s ease; }
                .theme-swatch:hover{ transform:translateY(-1px); box-shadow:0 12px 30px rgba(0,0,0,.35); }
                .theme-chips{ display:flex; gap:6px; }
                .theme-chip{ width:14px; height:14px; border-radius:50%; border:1px solid rgba(255,255,255,.25); }

                input[type=range]{ appearance:none; height:8px; border-radius:9999px; background:linear-gradient(90deg, rgba(255,255,255,.1), rgba(255,255,255,.06)); outline:none; }
                input[type=range]::-webkit-slider-thumb{ appearance:none; width:22px; height:22px; border-radius:50%; background:radial-gradient(circle at 40% 40%, #fff, var(--theme-highlight)); border:1px solid rgba(0,0,0,.25); box-shadow:0 6px 16px rgba(0,0,0,.4); cursor:pointer; }
                input[type=range]::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background:radial-gradient(circle at 40% 40%, #fff, var(--theme-highlight)); border: 1px solid rgba(0,0,0,.25); box-shadow:0 6px 16px rgba(0,0,0,.4); cursor: pointer; }

                .pulse-meter-container { position: relative; width: 100%; height: 32px; border-radius: 9999px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: inset 0 2px 4px rgba(0,0,0,0.3); padding: 4px; overflow: hidden; }
                .pulse-meter-fill { position:relative; height:100%; border-radius:9999px; background:linear-gradient(90deg,var(--meter-stop-0),var(--meter-stop-1) 35%,var(--meter-stop-2) 75%,var(--meter-stop-3)); overflow:hidden; animation:meter-breath var(--beat-duration) ease-in-out infinite; filter: blur(0.5px) saturate(1.3); transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
                .pulse-meter-gloss { position: absolute; top: 0; left: 0; width: 100%; height: 50%; background: linear-gradient(to bottom, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.1)); opacity: 0.8; border-radius: 9999px 9999px 0 0; }
                .pulse-meter-wave { position:absolute; top:0; left:0; width:100%; height:100%; background:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%27200%27 height=%2732%27><path d=%27M0 16 Q 25 0, 50 16 T 100 16 T 150 16 T 200 16%27 fill=%27none%27 stroke=%27white%27 stroke-width=%272%27 opacity=%270.6%27/></svg>") repeat-x; background-size: 200px 100%; animation:wave-move var(--wave-duration, 2s) linear infinite; mix-blend-mode:overlay; filter:drop-shadow(0 0 3px var(--wave-glow-color)); }
                .pulse-meter-outer-glow { position: absolute; inset: 0; border-radius: 9999px; box-shadow: 0 0 15px var(--meter-stop-3); animation: pulse-sync var(--beat-duration) ease-in-out infinite; }
                .pulse-meter-ripple { position: absolute; inset: 0; border-radius: 9999px; border: 2px solid var(--meter-stop-3); }
                
                @media (prefers-reduced-motion: reduce) { 
                    #app-container *, .reduced-motion * { transition:none!important; } 
                    .reduced-motion .pulse-meter-ripple, .reduced-motion .pulse-meter-outer-glow, .reduced-motion .begin-button::before, .reduced-motion .vignette-overlay, .reduced-motion .wheel-shimmer { animation: none !important; }
                    #app-container .wheel-canvas, .reduced-motion .wheel-canvas { transform: none !important; } 
                }
                
                .bg-layer { position: fixed; inset: 0; width: 100%; height: 100%; z-index: -1; background-size: 200% 200%; animation: background-pan 15s ease infinite; animation-duration: calc(20s - (var(--pulse-glow-intensity, 0) * 10s)); transition: opacity 0.5s ease-in-out; background-blend-mode: overlay; }
                .theme-velour-nights-bg { background-image: linear-gradient(135deg, #4c1d2f 0%, #2c1a2b 50%, #200f18 100%), radial-gradient(circle at 70% 30%, rgba(247, 119, 182, 0.25), transparent 60%); }
                .theme-lotus-dreamscape-bg { background-image: linear-gradient(135deg, #2D2447 0%, #4B0082 50%, #191526 100%), radial-gradient(circle at 30% 70%, rgba(106, 90, 205, 0.3), transparent 60%); }
                .theme-velvet-carnival-bg { background-image: linear-gradient(135deg, #6b2c00 0%, #3d1a00 50%, #2e1100 100%), radial-gradient(circle at 80% 80%, rgba(255, 69, 0, 0.2), transparent 50%); }
                .theme-starlit-abyss-bg { background-image: linear-gradient(135deg, #0A0C24 0%, #1D1A4B 25%, #13143B 75%, #0B0F2A 100%), radial-gradient(circle at 30% 70%, rgba(138,43,226,0.25), transparent 70%); }
                .theme-crimson-frenzy-bg { background-image: linear-gradient(135deg, #2b0000 0%, #4b0000 50%, #1c0000 100%), radial-gradient(circle at 50% 50%, rgba(220, 20, 60, 0.3), transparent 70%); }
                
                .spin-button { width: 100%; height: 100%; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--theme-base); position: relative; transform-style: preserve-3d; perspective: 800px; transition: transform 0.1s ease, box-shadow 0.1s ease; box-shadow: 0 6px 18px rgba(0,0,0,0.45), inset 0 2px 3px var(--btn-gloss); }
                .spin-button:hover:not(:disabled) { transform: translateZ(3px); box-shadow: 0 8px 24px rgba(0,0,0,0.55), inset 0 2px 3px var(--btn-gloss); }
                .spin-button:active:not(:disabled) { transform: translateZ(1px) scale(0.97); box-shadow: 0 4px 14px rgba(0,0,0,0.65), inset 0 2px 3px var(--btn-gloss); }
                .spin-button:disabled { cursor: not-allowed; filter: grayscale(0.5) brightness(0.7); }
                .spin-button-text { font-family: 'Inter', sans-serif; font-weight: 800; font-size: clamp(1rem, 5vw, 1.5rem); color: var(--theme-shadow); filter: drop-shadow(0 1px 1px rgba(255,255,255,0.5)); }
                
                .begin-button { border-radius: 9999px; position: relative; overflow: hidden; will-change: transform; }
                .begin-button::before { content: ''; position: absolute; top: 50%; left: 50%; width: 100%; height: 100%; border-radius: 50%; border: 2px solid var(--theme-highlight); animation: ripple-glow 2s infinite ease-out; will-change: transform, opacity; }
                .begin-button:disabled::before { display: none; }
                .vignette-overlay { box-shadow: inset 0 0 15vw 5vw rgba(0,0,0,0.5); animation: pulse-vignette var(--beat-duration) infinite alternate ease-in-out; }
                @keyframes pulse-vignette { from { box-shadow: inset 0 0 15vw 5vw rgba(0,0,0,0.4); } to { box-shadow: inset 0 0 18vw 6vw rgba(0,0,0,0.6); } }
                .bg-power-surge { background: radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 70%); }
                .noise-animated { background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJub2lzZSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuOCIgbnVtT2N0YXZlcz0iMyIgc3RpdGNoVGlsZXM9InN0aXRjaCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIiBmaWx0ZXI9InVybCgjbm9pc2UpIi8+PC9zdmc+'); animation: noise-pan 15s steps(20) infinite; }
                .radial-light-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 10; background: radial-gradient(200px circle at var(--light-x, -100%) var(--light-y, -100%), rgba(255,255,255,0.15), transparent); mix-blend-mode: soft-light; transition: background 0.2s ease-out; }
                .hdr-glow-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 15; background: radial-gradient(circle at 50% 50%, var(--theme-highlight) 0%, transparent 60%); mix-blend-mode: screen; opacity: calc(var(--pulse-glow-intensity) * 0.4); transition: opacity 0.3s ease-out; }
                .aurora-reflect { position: fixed; inset: 0; background: radial-gradient(circle at var(--light-x,50%) var(--light-y,50%), rgba(255,255,255,0.08), transparent 70%); mix-blend-mode: soft-light; pointer-events: none; z-index: 15; }
                
                .extreme-effect-bg.crimsonFrenzy { background: radial-gradient(circle, rgba(255, 0, 0, 0.1), transparent 70%); }
                .extreme-scanlines { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(255,0,0,0.2) 51%); background-size: 100% 8px; animation: glitch 0.5s infinite; }
                .extreme-effect-bg.starlitAbyss { background: linear-gradient(135deg, rgba(72,61,139,0.3) 0%, rgba(138,43,226,0.3) 50%, rgba(65,105,225,0.3) 100%); background-size: 400% 400%; animation: aurora 8s ease-in-out infinite; }
                .extreme-effect-bg.velvetCarnival { box-shadow: inset 0 0 30px 10px #FFD700; animation: neon-flicker 0.2s infinite alternate; }
                .extreme-effect-bg.lotusDreamscape::before { content: '🌸'; position: absolute; font-size: 3rem; color: #FFB7FF; animation: drift 10s linear infinite; top: -10%; left: 10%; }
                .extreme-effect-bg.lotusDreamscape::after { content: '💮'; position: absolute; font-size: 2rem; color: #ADD8E6; animation: drift 15s linear infinite reverse; bottom: -10%; right: 20%; }
                @keyframes drift { to { transform: translateY(120vh) translateX(20vw) rotate(720deg); opacity: 0; } }

                @supports not (backdrop-filter: blur(1px)) { .modal-metallic, .metallic-input-wrapper { background: rgba(20, 10, 30, 0.9); } }
                
                /* Pre-game button color overrides */
                .theme-velour-nights:not(:has(main)) .btn--primary,
                .theme-velvet-carnival:not(:has(main)) .btn--primary,
                .theme-crimson-frenzy:not(:has(main)) .btn--primary {
                    background: radial-gradient(circle at 50% 38%, #ff6b81 0%, #e3586e 90%);
                    color: white;
                }
                .theme-velour-nights:not(:has(main)) .btn--primary:hover:not(:disabled),
                .theme-velvet-carnival:not(:has(main)) .btn--primary:hover:not(:disabled),
                .theme-crimson-frenzy:not(:has(main)) .btn--primary:hover:not(:disabled) {
                    box-shadow: 0 8px 24px rgba(227, 88, 110, 0.55), inset 0 2px 3px var(--btn-gloss);
                }

                .theme-starlit-abyss:not(:has(main)) .btn--primary {
                    background: radial-gradient(circle at 50% 38%, #7bb1ff 0%, #5c95e6 90%);
                     color: white;
                }
                .theme-starlit-abyss:not(:has(main)) .btn--primary:hover:not(:disabled) {
                    box-shadow: 0 8px 24px rgba(92, 149, 230, 0.55), inset 0 2px 3px var(--btn-gloss);
                }

                .theme-lotus-dreamscape:not(:has(main)) .btn--primary {
                    background: radial-gradient(circle at 50% 38%, #c792ea 0%, #a365d8 90%);
                     color: white;
                }
                .theme-lotus-dreamscape:not(:has(main)) .btn--primary:hover:not(:disabled) {
                    box-shadow: 0 8px 24px rgba(163, 101, 216, 0.55), inset 0 2px 3px var(--btn-gloss);
                }
            `}</style>
            <div className={`bg-layer ${activeBg === 1 ? 'opacity-100' : 'opacity-0'} ${activeBackgroundClass}`}></div>
            <div className={`bg-layer ${activeBg === 2 ? 'opacity-100' : 'opacity-0'} ${activeBackgroundClass}`}></div>

            <div className='hdr-glow-overlay' />
            <Vignette />
            <ParticleBackground currentTheme={backgroundTheme} pulseLevel={pulseLevel} bpm={audioEngine.getCurrentBpm()} reducedMotion={prefersReducedMotion} />
            <NoiseOverlay reducedMotion={prefersReducedMotion} />
            <div className='aurora-reflect' />
            <RadialLighting reducedMotion={prefersReducedMotion} />

            <AnimatePresence>
                {showConfetti && <Confetti key="confetti" onFinish={() => setShowConfetti(false)} origin={confettiOrigin} theme={backgroundTheme} reducedMotion={prefersReducedMotion} />}
                {showPowerSurge && <PowerSurgeEffect key="power-surge" onComplete={() => setShowPowerSurge(false)} reducedMotion={prefersReducedMotion} />}
            </AnimatePresence>
            
            <div id="app-content" aria-hidden={!!modalState.type} className="w-full h-screen relative overflow-hidden">
                 {renderContent()}
            </div>

            <AnimatePresence>
                {gameState === 'turnIntro' && ( <TurnBanner key={`turn-banner-${roundCount}`} playerName={players[currentPlayer]} /> )}
                {modalState.type === 'extremeIntro' && (
                    <React.Fragment key={`modal-${modalState.type}`}>
                        <ExtremeIntroEffect theme={backgroundTheme} reducedMotion={prefersReducedMotion}/>
                        <ExtremeIntroModal isOpen={true} onClose={handleExtremeIntroClose} activeVisualTheme={activeVisualTheme} />
                    </React.Fragment>
                )}
                {modalState.type === 'prompt' && <PromptModal key={`modal-${modalState.type}`} isOpen={true} onClose={handlePromptModalClose} onRefuse={handleRefuse} prompt={modalState.data} activeVisualTheme={activeVisualTheme} />}
                {modalState.type === 'consequence' && <ConsequenceModal key={`modal-${modalState.type}`} isOpen={true} onClose={handleConsequenceClose} text={modalState.data.text} activeVisualTheme={activeVisualTheme} />}
                {modalState.type === 'editor' && <EditorModal key={`modal-${modalState.type}`} isOpen={true} onClose={handleEditorClose} prompts={prompts} onReset={() => setModalState({ type: 'confirmReset', data: {from: 'settings'} })} activeVisualTheme={activeVisualTheme} />}
                {modalState.type === 'settings' && <SettingsModal key={`modal-${modalState.type}`} isOpen={true} onClose={() => setModalState({ type: null })} settings={settings} onSettingsChange={(newSettings) => setSettings(prev => ({...prev, ...newSettings}))} isMuted={isMuted} onMuteToggle={handleToggleMute} onEditPrompts={() => setModalState({ type: 'editor', data: { from: 'settings' } })} onResetPrompts={() => setModalState({ type: 'confirmReset' })} onThemeChange={handleThemeChange} currentTheme={currentTheme} userId={userId} onRestart={() => setModalState({ type: 'confirmRestart' })} onQuit={() => setModalState({ type: 'confirmQuit' })} activeVisualTheme={activeVisualTheme} reducedMotion={prefersReducedMotion} onReducedMotionToggle={() => setPrefersReducedMotion(p => !p)} />}
                {modalState.type === 'confirmReset' && <ConfirmModal key={`modal-${modalState.type}`} isOpen={true} onClose={() => { setModalState({ type: modalState.data?.from === 'settings' ? 'editor' : 'settings', data: { from: 'settings' } }); }} onConfirm={handleConfirmReset} title="Confirm Reset" message="Are you sure? This will replace all prompts with the defaults." activeVisualTheme={activeVisualTheme} />}
                {modalState.type === 'confirmRestart' && <ConfirmModal key={`modal-${modalState.type}`} isOpen={true} onClose={() => { setModalState({ type: 'settings' }); }} onConfirm={handleRestartGame} title="Confirm Restart" message="Are you sure? This will restart the game and reset all progress." activeVisualTheme={activeVisualTheme} />}
                {modalState.type === 'confirmQuit' && <ConfirmModal key={`modal-${modalState.type}`} isOpen={true} onClose={() => { setModalState({ type: 'settings' }); }} onConfirm={handleQuitGame} title="Confirm Quit" message="Are you sure you want to quit? All progress will be lost." activeVisualTheme={activeVisualTheme} />}
            </AnimatePresence>
        </div>
    );
}

export default App;

