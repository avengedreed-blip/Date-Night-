import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// External Firebase Imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

/**
 * audioEngine.js (Integrated)
 * A comprehensive, modular audio engine with separate volume controls for Music and SFX.
 */
const audioEngine = (() => {
    // FIX: Declare global variables to prevent ReferenceErrors
    let isInitialized = false;
    let synths = {};
    let themes = {};
    let activeTheme = null;
    let musicChannel, sfxChannel;

    const createChannels = () => {
        const Tone = window.Tone;
        if (!Tone) return;
        musicChannel = new Tone.Channel(-6, 0).toDestination(); // Default music volume slightly lower
        sfxChannel = new Tone.Channel(0, 0).toDestination();
    };

    const createSynths = () => {
        const Tone = window.Tone;
        if (!Tone) return;
        const sfxReverb = new Tone.Reverb({ decay: 3, wet: 0.6 }).connect(sfxChannel);
        synths.spinBlip = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0 } }).connect(sfxReverb);
        synths.spinNoise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.01, decay: 0.5, sustain: 0 } }).connect(sfxChannel);
        const noiseFilter = new Tone.AutoFilter('8n', 500, 4).connect(sfxReverb).start();
        synths.spinNoise.connect(noiseFilter);
        synths.tick = new Tone.PluckSynth({ resonance: 0.1, dampening: 8000, volume: -10 }).connect(sfxReverb);
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
        // SUGGESTION FIX: Added a more appropriate UI sound for non-wheel actions
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

        const neonReverb = new Tone.Reverb({ decay: 5, wet: 0.5 }).connect(musicChannel);
        const neonDelay = new Tone.FeedbackDelay('8n.', 0.4).connect(neonReverb);
        const neonPad = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth' }, envelope: { attack: 2, decay: 1, sustain: 0.5, release: 3 } }).connect(neonDelay);
        const neonBass = new Tone.FMSynth({ harmonicity: 0.5, modulationIndex: 5, envelope: { attack: 0.01, release: 0.5 } }).connect(neonReverb);
        const neonKick = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 10, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 } }).connect(musicChannel);
        const neonClap = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0 } }).connect(musicChannel);
        themes.romanticNeon = {
            bpm: 85,
            parts: [
                createThemePart(neonPad, [{ time: '0:0', notes: ['C3', 'E3', 'G3'], duration: '2m' }, { time: '2:0', notes: ['A2', 'C3', 'E3'], duration: '2m' }]),
                new Tone.Sequence((time, note) => { neonBass.triggerAttackRelease(note, '8n', time); }, ['C2', 'C2', 'C2', 'E2', 'A1', 'A1', 'A1', 'G1'], '4n'),
                new Tone.Loop(time => { neonKick.triggerAttackRelease('C1', '8n', time); }, '2n'),
                new Tone.Loop(time => { neonClap.triggerAttackRelease('4n', time); }, '2n')
            ]
        };
        const funReverb = new Tone.Reverb({ decay: 2, wet: 0.4 }).connect(musicChannel);
        const funMarimba = new Tone.PolySynth(Tone.MembraneSynth, { pitchDecay: 0.01, octaves: 4, envelope: { attack: 0.005, decay: 0.3, sustain: 0 } }).connect(funReverb);
        const funBass = new Tone.Synth({ oscillator: { type: 'fmsquare' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0 } }).connect(funReverb);
        const shakerFilter = new Tone.Filter(2000, 'highpass').connect(funReverb);
        const funShaker = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.005, decay: 0.05, sustain: 0 }, volume: -15 }).connect(shakerFilter);
        themes.playfulFun = {
            bpm: 100,
            parts: [
                new Tone.Pattern((time, note) => { funMarimba.triggerAttackRelease(note, '8n', time); }, ['C4', 'E4', 'G4', 'A4'], 'randomWalk'),
                new Tone.Sequence((time, note) => { funBass.triggerAttackRelease(note, '16n', time); }, ['C2', null, 'C2', ['E2', 'D2']], '8n'),
                new Tone.Loop(time => { funShaker.triggerAttack(time); }, '16n')
            ]
        };
        const extremeDistortion = new Tone.Distortion(0.6).connect(musicChannel);
        const extremeBass = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.5, release: 0.2 } }).connect(extremeDistortion);
        const extremeKick = new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 6 }).connect(musicChannel);
        const extremeSnare = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0 } }).connect(musicChannel);
        const sweepFilter = new Tone.AutoFilter('1m').connect(extremeDistortion);
        const noiseSweep = new Tone.Noise('white').connect(sweepFilter).start();
        noiseSweep.volume.value = -20;
        themes.highStakes = {
            bpm: 120,
            parts: [
                new Tone.Sequence((time, note) => { extremeBass.triggerAttackRelease(note, '16n', time); }, ['C2', 'C2', 'C2', 'C#2', 'C2', 'C2', 'C2', 'D#2'], '8n'),
                new Tone.Loop(time => { extremeKick.triggerAttackRelease('C1', '8n', time); }, '4n'),
                new Tone.Loop(time => { extremeSnare.triggerAttackRelease('8n', time); }, '2n')
            ]
        };
        // "Trivia Challenge" theme has been removed.
    };

    const publicApi = {
        async initialize() {
            const Tone = window.Tone;
            if (isInitialized || !Tone) return false;
            try {
                await Tone.start();
                if (Tone.context.state !== 'running') return false;
                createChannels();
                createSynths();
                createThemes();
                isInitialized = true;
                console.log("Audio Engine Initialized.");
                return true;
            } catch (e) { console.error("Audio Engine Init Error:", e); return false; }
        },
        startTheme(themeName) {
            const Tone = window.Tone;
            if (!isInitialized || !Tone || !themes[themeName] || (activeTheme && activeTheme.name === themeName)) return;
            this.stopTheme();
            activeTheme = themes[themeName];
            activeTheme.name = themeName;
            activeTheme.parts.forEach(p => p.start(0));
            Tone.Transport.bpm.value = activeTheme.bpm;
            if (Tone.Transport.state !== 'started') Tone.Transport.start();
        },
        stopTheme() {
            const Tone = window.Tone;
            if (!isInitialized || !Tone || !activeTheme) return;
            activeTheme.parts.forEach(p => p.stop(0).cancel(0));
            activeTheme = null;
            if (Tone.Transport.state === 'started') Tone.Transport.stop();
        },
        toggleMute(shouldMute) {
            const Tone = window.Tone;
            if (!isInitialized || !Tone) return false;
            Tone.Destination.mute = shouldMute;
            return Tone.Destination.mute;
        },
        setMasterVolume(levelInDb) { if (isInitialized && window.Tone) window.Tone.Destination.volume.value = levelInDb; },
        setMusicVolume(levelInDb) { if (isInitialized && musicChannel) musicChannel.volume.value = levelInDb; },
        setSfxVolume(levelInDb) { if (isInitialized && sfxChannel) sfxChannel.volume.value = levelInDb; },
        playWheelSpinStart: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.spinBlip.triggerAttackRelease('C5', '8n', now); synths.spinNoise.triggerAttack(now); },
        playWheelTick: () => { if (!isInitialized) return; synths.tick.triggerAttack(`C${Math.floor(Math.random() * 2) + 4}`, window.Tone.now(), Math.random() * 0.2 + 0.8); },
        playWheelStopSound: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.wheelStopChord.triggerAttackRelease(['E4', 'G4', 'C5'], '4n', now); synths.wheelStopArpSeq.start(now).stop(now + 0.5); },
        playModalOpen: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.modalWhoosh.triggerAttack(now); synths.modalShimmer.triggerAttackRelease('2n', now + 0.1); },
        playModalClose: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.modalClose.triggerAttack('G5', now); synths.modalClose.triggerAttack('C4', now + 0.1); },
        playCorrect: () => { if (!isInitialized) return; synths.correct.triggerAttackRelease(['C5', 'E5', 'G5'], '8n', window.Tone.now()); },
        playWrong: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.wrong.frequency.setValueAtTime('G4', now); synths.wrong.frequency.linearRampToValueAtTime('G3', now + 0.4); synths.wrong.triggerAttack(now); synths.wrong.triggerRelease(now + 0.4); },
        playExtremePrompt: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.extremeSwell.triggerAttack(now); synths.extremeHit.triggerAttackRelease('C1', '1m', now + 1.4); },
        playRefuse: () => { if (!isInitialized) return; const now = window.Tone.now(); synths.refuse.triggerAttack('C6', now); synths.refuse.triggerAttack('C4', now + 0.1); },
        playUIConfirm: () => { if (!isInitialized) return; synths.uiConfirm.triggerAttackRelease('C6', '16n'); }
    };
    publicApi.playClick = publicApi.playWheelSpinStart;
    return publicApi;
})();

// --- EXPANDED PROMPTS ---
const defaultPrompts = {
    truthPrompts: {
        normal: [
            "Would you remarry if your partner died?", "Do you ever regret marrying your partner?", "What's your biggest regret? Explain.", "What's your favorite thing that your partner does for you?", "What do you envision the next 50 years with your partner being like? Explain in great detail.", "Tell your partner something that they need to improve on. Go into great detail.", "What's one thing you're scared to ask me, but really want to know?", "What is a secret you've kept from your parents?", "Describe a dream you've had about me.", "If you could change one thing about our history, what would it be?", "What's the most childish thing you still do?",
            "What do you think is your partner's biggest strength?", "If money didn't matter, what would you want your partner to do with their life?", "What song always makes you think of your partner?", "What was your happiest childhood memory?", "What's one thing you've always wanted to tell your partner, but never have?", "What scares you most about the future with your partner?", "What's one thing you wish you and your partner could do more often?", "If you could relive one day of your relationship, which would it be?"
        ],
        spicy: [
            "What's your favorite part of your partner's body?", "Describe a time they turned you on without even realizing it.", "Tell me a sexual fantasy involving us you've never shared.", "What's the most embarrassing thing that's ever happened to you during sex?", "Who's the best sexual partner you've ever had? And why?", "Name a celebrity you've had a sexual fantasy about.", "If you could only do one sex act for the rest of your life, what would it be?", "Have you ever cheated on a partner?", "Have you ever faked an orgasm with your current partner?", "Tell your partner what you're thinking about in great detail, when you're horny prior to sex.", "What's the naughtiest thought you've had about me this week?", "Rank your top three favorite positions.", "What's one thing you want me to do to you in bed more often?",
            "What's the sexiest dream you've ever had about your partner?", "What's the dirtiest compliment you secretly want from your partner?", "Where's the riskiest place you'd want to fool around with your partner?", "If you could make your partner wear any outfit for you, what would it be?", "What's your favorite way your partner touches you when you want it to lead to sex?", "What's a fantasy involving your partner you've never admitted out loud?", "If you could freeze time, what would you do to your partner while no one else was watching?", "What's a kink you're curious about but nervous to try with your partner?", "Which body part of your partner do you think about most when they're not around?", "What's your favorite way your partner has teased you without realizing it?"
        ],
        extreme: [
            "Describe your partner's genitals in great detail.", "Which ex would you most likely allow to have a threesome with you and your partner?", "Which ex looked the best naked?", "Describe a sexual experience with an ex in great detail.", "Have you ever masturbated in an inappropriate time or place?", "What do you want to do to your partner right now? Be detailed.", "Tell your partner any ways that they can improve in bed.", "What is the biggest lie you have ever told me?", "Have you ever considered leaving me? If so, why?", "Describe the most intense orgasm you've ever had, with or without me.", "What is something you've never told anyone about your sexual history?",
            "Describe, in detail, your perfect sexual scenario with your partner.", "What's the nastiest thought you've ever had about your partner in public?", "If you could film yourself and your partner doing anything in bed, what would you want captured?", "What's the dirtiest porn search you've ever typed that you'd want to try with your partner?", "Which of your partner's friends have you thought about sexually (even fleetingly)?", "What's the roughest or wildest thing you secretly want your partner to do to you?", "What's your most shameful fantasy you'd never tell your partner's family?", "If you could erase one sexual experience from your past before meeting your partner, what would it be?", "What do you imagine when you masturbate that you haven't told your partner?"
        ]
    },
    darePrompts: {
        normal: [
            "Take a cute selfie with your partner.", "Give your best impression of your partner.", "Let your partner tickle you for 30 seconds.", "Give your partner a shoulder rub for 3 minutes.", "Do a somersault.", "Do 10 jumping jacks.", "Give your partner a hug, as if they were dying.", "Post a picture of your partner on social media with a loving caption.", "Let your partner draw a temporary tattoo on you with a pen.", "Serenade your partner with a love song, even if you can't sing.", "Do your best runway walk for your partner.",
            "Take a silly selfie right now and show your partner.", "Speak in an accent for the next 2 rounds with your partner.", "Tell your partner two truths and a lie.", "Share your screen time stats with your partner.", "Do your best dance move for your partner for 20 seconds.", "Hug a pillow and pretend it's your partner for one minute.", "Let your partner pick a silly nickname for you for the rest of the game.", "Text a random emoji to a friend and show your partner the reply.", "Sing your favorite chorus from memory to your partner.", "Pretend to be your partner for one round."
        ],
        spicy: [
            "Give me a passionate kiss, as if we haven't seen each other in a month.", "Whisper what you want to do to me later tonight in my ear.", "Gently remove one item of my clothing.", "Sit in your partner's lap for 3 rounds.", "Touch your partner through their clothes until they're aroused.", "Take a sexy selfie in only your underwear and send it to your partner.", "Flash your partner a private part of your choosing.", "Explain in graphic detail how you like to masturbate.", "Give your partner a topless lap dance.", "Gently kiss your partner's naked genitals.", "Let me choose an item of your clothing for you to remove.", "Give your partner a hickey somewhere they can hide it.", "Describe how you would tease me if we were in public right now.",
            "Describe out loud how you'd undress your partner right now.", "Let your partner choose a body part for you to kiss.", "Show your partner how you'd seduce them in public without anyone noticing.", "Whisper something filthy in your partner's ear.", "Stroke your partner's hand or arm like you would in foreplay.", "Show your partner your sexiest facial expression.", "Bite your lip and hold eye contact with your partner for 30 seconds.", "Kiss your partner as if it were your first time.", "Moan your partner's name in a way that turns them on."
        ],
        extreme: [
            "Give your partner a hand job for 3 minutes.", "Sit on your partner's face, or let them sit on your face for 3 minutes.", "Soak for 5 minutes.", "Masturbate for 5 minutes while watching porn that your partner picked.", "Edge your partner twice.", "Perform oral sex on your partner for 2 minutes.", "Use a sex toy on your partner for 3 minutes.", "Allow your partner to use any sex toy they'd like on your for the next 5 minutes.", "Wear a butt plug for the next 10 minutes.", "Let your partner tie you up for 5 minutes and do what they want.", "Roleplay a fantasy of your partner's choosing for 5 minutes.", "Take a nude photo and send it to your partner right now.",
            "Lick or suck on a body part your partner chooses.", "Let your partner spank you as hard as they want 5 times.", "Send your partner a dirty voice note moaning their name.", "Simulate oral sex on your fingers for 30 seconds in front of your partner.", "Strip completely naked and pose however your partner says.", "Show your partner how you masturbate, in detail.", "Act out your favorite porn scene with your partner.", "Put something of your partner's in your mouth and treat it like foreplay.", "Let your partner tie your hands for the next 3 rounds.", "Edge yourself while your partner watches for 2 minutes.", "Edge your partner while you watch for 2 minutes."
        ]
    },
    triviaQuestions: {
        normal: [
            "What is your partner's birthday?", "What is your partner's favorite show?", "What is their biggest insecurity?", "What is your partner's biggest fear?", "What is their dream job if money were no object?", "What is one thing your partner has always wanted to try but hasn't yet?", "What is the first gift you gave each other?", "What is your partner's favorite childhood cartoon?", "What is the name of your partner's first pet?", "What is your partner's favorite board game?", "Would you rather go into the past and meet your ancestors or go into the future and meet your great-great grandchildren?", "What was their favorite band in high school?", "What do they love most about themselves?", "What do they love the most about you?", "What's my favorite animal?", "If they could haunt anyone as a ghost, who would it be?", "What is their dream vacation?", "What accomplishment are they most proud of?", "What historical figure would they most want to have lunch with?", "What is their least favorite food?",
            "What's your partner's go-to comfort food?", "What movie does your partner always want to rewatch?", "What's your partner's biggest pet peeve?", "Which holiday does your partner love the most?", "What's your partner's dream car?", "What color does your partner secretly dislike wearing?", "Who was your partner's first celebrity crush?", "What's your partner's most annoying habit (to you)?", "If your partner could instantly master one skill, what would it be?"
        ]
    },
    consequences: {
        normal: [
            "You have to call your partner a name of their choosing for the rest of the game.", "Every wrong answer for the rest of the game gets you tickled for 20 seconds.", "Go get your partner a drink.", "Make your partner a snack.", "You have to end every sentence with 'my love' for the next 3 rounds.", "Give your partner your phone and let them send one playful text to anyone.",
            "Compliment your partner 5 times in a row.", "Give your partner control of the TV remote tonight.", "Swap seats with your partner for the next round.", "Tell your partner a secret you've never told them.", "Let your partner take an unflattering picture of you.", "You can only answer your partner with 'yes, my love' until your next turn.", "Wear a silly hat (or make one) until the game ends with your partner.", "Post a sweet compliment about your partner on social media."
        ],
        spicy: [
            "Play the next 3 rounds topless.", "For the next 5 rounds, every time it's your turn, you have to start by kissing your partner.", "Your partner gets to give you one command, and you must obey.", "Play the next 3 rounds bottomless.", "Every wrong answer or refusal requires you to send your partner a nude picture for the rest of the game. Even your partner's wrong answers.", "Remove an article of clothing each round for the remainder of the game.", "Do ten jumping jacks completely naked.", "Swap clothes with your partner for the remainder of the game.", "Your partner gets to spank you, as hard as they want, 5 times.",
            "Kiss your partner somewhere unexpected.", "Tell your partner your dirtiest thought in the last 24 hours.", "For the next round, sit on your partner's lap.", "Let your partner bite or nibble a place of their choice.", "You have to let your partner mark you with lipstick or a marker.", "Show your partner your favorite sex position (with clothes on).", "Tease your partner without kissing for 1 minute.", "Send your partner a sexy text right now while sitting next to them.", "Give your partner a 1-minute lap dance."
        ],
        extreme: [
            "Wear a butt plug for the remainder of the game.", "Record yourself masturbating right now and send it to your partner.", "Use a sex toy of your partner's choosing for the remainder of the game.", "Edge yourself for the remainder of the game.", "Allow your partner to act out a fantasy of theirs, and you can't say no.", "You must perform any sexual act your partner demands, right now.",
            "Send your partner the filthiest nude you've ever taken.", "Use your tongue on any body part your partner picks.", "Strip completely and stay that way until the round ends with your partner.", "Let your partner spank or choke you until they're satisfied.", "Put on a show of how you like to be touched for your partner.", "Allow your partner to record 30 seconds of you doing something sexual.", "Play with a toy in front of your partner right now.", "Moan out loud for 1 minute straight for your partner.", "Let your partner pick your sexual punishment and don't complain."
        ]
    }
};

const useFirestorePrompts = () => {
    const [db, setDb] = useState(null);
    const [prompts, setPrompts] = useState(defaultPrompts);
    const [isLoading, setIsLoading] = useState(true);
    const [userId, setUserId] = useState(null);

    useEffect(() => {
        if (!firebaseConfig.projectId) {
            console.warn("Firebase config not found. Using default prompts.");
            setIsLoading(false);
            return;
        }

        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authInstance = getAuth(app);
        setDb(firestore);

        onAuthStateChanged(authInstance, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                try {
                    const userCredential = initialAuthToken ? await signInWithCustomToken(authInstance, initialAuthToken) : await signInAnonymously(authInstance);
                    setUserId(userCredential.user.uid);
                } catch (e) {
                    console.error("Auth failed:", e);
                    setUserId(crypto.randomUUID());
                }
            }
        });
    }, []);

    const getPromptsDocRef = useCallback((firestore, uid) => {
        if (!firestore || !uid) return null;
        return doc(firestore, 'artifacts', appId, 'users', uid, 'prompts', 'custom_data');
    }, [appId]);

    useEffect(() => {
        if (db && userId) {
            const userDocRef = getPromptsDocRef(db, userId);
            if (!userDocRef) {
                setIsLoading(false);
                return;
            }

            const saveDefaults = async () => {
                try {
                    await setDoc(userDocRef, { data: defaultPrompts }, { merge: true });
                } catch (e) { console.error("Could not set initial defaults:", e); }
            };

            const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data().data) {
                    setPrompts(docSnap.data().data);
                } else {
                    saveDefaults();
                }
                setIsLoading(false);
            }, (error) => {
                console.error("Error listening to prompts:", error);
                setIsLoading(false);
            });

            return () => unsubscribe();
        } else if (!firebaseConfig.projectId) {
            setIsLoading(false);
        }
    }, [db, userId, getPromptsDocRef]);

    const updatePrompts = useCallback(async (newPrompts) => {
        if (db && userId) {
            const userDocRef = getPromptsDocRef(db, userId);
            if (!userDocRef) return;
            try {
                await setDoc(userDocRef, { data: newPrompts }, { merge: false });
            } catch (e) { console.error("Error updating prompts:", e); }
        }
    }, [db, userId, getPromptsDocRef]);

    return { prompts, updatePrompts, isLoading, userId };
};

// --- UI COMPONENTS & UTILITIES ---
const SettingsIcon = React.memo(() => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1.51-1V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V12c0 .36.05.7.14 1.03.22.84.97 1.34 1.77 1.34h.09a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09A1.65 1.65 0 0 0 19.4 15z"></path></svg>));
const SpeakerIcon = React.memo(({ muted }) => ( muted ? (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="22" y1="9" x2="16" y2="15"></line><line x1="16" y1="9" x2="22" y2="15"></line></svg>) : (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>) ));
const TrashIcon = React.memo(() => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#F777B6] hover:text-[#FFC0CB]"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>));

const ParticleBackground = () => {
    const canvasRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width, height, particles = [], animationFrameId;
        const maxParticles = 50;
        const resizeCanvas = () => { width = canvas.width = canvas.offsetWidth; height = canvas.height = canvas.offsetHeight; };
        class Particle { constructor() { this.x = Math.random() * width; this.y = Math.random() * height; this.radius = Math.random() * 1.5 + 0.5; this.speedX = (Math.random() - 0.5) * 0.1; this.speedY = (Math.random() - 0.5) * 0.1; this.color = `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.1})`; } update() { this.x += this.speedX; this.y += this.speedY; if (this.x < 0 || this.x > width) this.speedX *= -1; if (this.y < 0 || this.y > height) this.speedY *= -1; } draw() { ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fillStyle = this.color; ctx.shadowBlur = this.radius * 2; ctx.shadowColor = '#F777B6'; ctx.fill(); } }
        const createParticles = () => { particles = []; for (let i = 0; i < maxParticles; i++) { particles.push(new Particle()); } };
        const animate = () => { ctx.clearRect(0, 0, width, height); particles.forEach(p => { p.update(); p.draw(); }); animationFrameId = requestAnimationFrame(animate); };
        resizeCanvas(); createParticles(); animate();
        window.addEventListener('resize', resizeCanvas);
        return () => { window.removeEventListener('resize', resizeCanvas); cancelAnimationFrame(animationFrameId); };
    }, []);
    return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-70 z-0"></canvas>;
};

const Confetti = ({ onFinish }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let width = canvas.offsetWidth;
        let height = canvas.offsetHeight;
        canvas.width = width;
        canvas.height = height;

        const particles = [];
        const particleCount = 200;
        const colors = ['#FFD700', '#F777B6', '#6A5ACD', '#FFFFFF'];

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height - height,
                speed: Math.random() * 3 + 2,
                radius: Math.random() * 5 + 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                tilt: Math.random() * 10 - 5,
                tiltAngle: 0,
                tiltAngleIncrement: Math.random() * 0.07 + 0.05,
            });
        }

        let animationFrameId;
        const startTime = Date.now();

        const animate = () => {
            if (Date.now() - startTime > 4000) { // Run for 4 seconds
                cancelAnimationFrame(animationFrameId);
                if(onFinish) onFinish();
                return;
            }

            ctx.clearRect(0, 0, width, height);
            particles.forEach((p, i) => {
                p.y += p.speed;
                p.tiltAngle += p.tiltAngleIncrement;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.save();
                ctx.translate(p.x + p.radius, p.y + p.radius);
                ctx.rotate(p.tiltAngle);
                ctx.fillRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
                ctx.restore();

                if (p.y > height) {
                    particles[i] = { ...p, x: Math.random() * width, y: -20 };
                }
            });
            animationFrameId = requestAnimationFrame(animate);
        };
        animate();

        return () => cancelAnimationFrame(animationFrameId);
    }, [onFinish]);

    return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full z-[100] pointer-events-none" />;
};


const Wheel = ({ onSpinFinish, playWheelSpinStart, playWheelTick, playWheelStop, isExtremeMode }) => {
    const [isSpinning, setIsSpinning] = useState(false);
    const [rotation, setRotation] = useState(0);
    const tickIntervalRef = useRef(null);

    // FIX: Add useEffect cleanup to prevent interval memory leaks
    useEffect(() => {
        return () => {
            clearInterval(tickIntervalRef.current);
        };
    }, []);

    const categories = useMemo(() => isExtremeMode ? ['TRUTH', 'DARE'] : ['TRUTH', 'DARE', 'TRIVIA'], [isExtremeMode]);
    const colors = useMemo(() => isExtremeMode ? ['#4B0082', '#6A5ACD'] : ['#4B0082', '#6A5ACD', '#F777B6'], [isExtremeMode]);
    
    const canvasRef = useRef(null);

    const drawWheel = useCallback((ctx) => {
        const size = 600;
        const center = size / 2;
        const radius = center - 5;
        const arc = (2 * Math.PI) / categories.length;
        ctx.clearRect(0, 0, size, size);

        ctx.save();
        ctx.translate(center, center);
        
        // Aligns 0 degrees at the top for easier calculations.
        ctx.rotate(-Math.PI / 2);

        categories.forEach((category, i) => {
            // Draw slice
            ctx.beginPath();
            ctx.fillStyle = colors[i];
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, radius, i * arc, (i + 1) * arc);
            ctx.closePath();
            ctx.fill();

            // Draw text
            ctx.save();
            ctx.rotate(i * arc + arc / 2);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FFD700';
            ctx.font = `bold ${size / 15}px 'Playfair Display', serif`;
            ctx.fillText(category, radius * 0.65, 10);
            ctx.restore();
        });

        ctx.restore();
    }, [categories, colors]);

    useEffect(() => {
        if (canvasRef.current) {
            drawWheel(canvasRef.current.getContext('2d'));
        }
    }, [drawWheel]);

    const handleSpin = () => {
        if (isSpinning) return;

        playWheelSpinStart();
        const spinDegrees = Math.random() * 3600 + 7200;
        const newRotation = rotation + spinDegrees;

        const segmentDegrees = 360 / categories.length;
        const finalAngle = newRotation % 360;
        
        // This math is robust because the drawing logic is normalized to start at the top.
        const stoppingAngle = (360 - finalAngle) % 360;
        const winningIndex = Math.floor(stoppingAngle / segmentDegrees);
        const winner = categories[winningIndex].toLowerCase();
        
        setRotation(newRotation);
        setIsSpinning(true);

        tickIntervalRef.current = setInterval(playWheelTick, 150);

        const canvas = canvasRef.current;
        if (canvas) {
            const onEnd = () => {
                clearInterval(tickIntervalRef.current);
                setIsSpinning(false);
                playWheelStop();
                onSpinFinish(winner);
                canvas.removeEventListener("transitionend", onEnd);
            };
            canvas.addEventListener("transitionend", onEnd);
        }
    };

    return (
        <div className="relative w-64 h-64 sm:w-80 sm:h-80 mx-auto mb-6">
            <div className="absolute top-[-10px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[20px] border-l-transparent border-r-[20px] border-r-transparent border-t-[30px] border-t-[#FFD700] z-20 shadow-2xl shadow-yellow-500/50"></div>
            <canvas
                ref={canvasRef}
                width="600"
                height="600"
                className="rounded-full transition-transform duration-[5000ms] ease-[cubic-bezier(0.25,1,0.5,1)] border-8 border-[#FFD700] shadow-2xl shadow-pink-500/50"
                style={{ transform: `rotate(${rotation}deg)` }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
                <motion.button
                    onClick={handleSpin}
                    disabled={isSpinning}
                    className="w-24 h-24 sm:w-28 sm:h-28 bg-[#FFD700] rounded-full text-[#4B0082] font-bold text-lg sm:text-xl uppercase shadow-2xl shadow-[#FFD700]/70 disabled:opacity-50 disabled:cursor-not-allowed font-serif tracking-widest"
                    whileTap={{ scale: 0.85, rotate: 5, boxShadow: '0 0 40px #FFD700' }}
                    whileHover={{ scale: 1.05, boxShadow: '0 0 30px #FFD700' }}
                    initial={{ scale: 1 }}
                    animate={isSpinning ? { scale: [1, 1.05, 1], transition: { duration: 1, repeat: Infinity } } : { scale: 1 }}
                >
                    {isSpinning ? '...' : 'Spin'}
                </motion.button>
            </div>
        </div>
    );
};

const SparkMeter = ({ level }) => {
    const isFull = level >= 100;
    
    return (
        <div className={`fixed top-4 left-4 md:top-6 md:left-6 z-[60] w-48 md:w-64 p-2 bg-black/40 backdrop-blur-md border border-white/20 rounded-full shadow-lg transition-all duration-500 ${isFull ? 'shadow-[0_0_20px_#FFD700]' : ''}`}>
             {isFull && <SparkleBurst />}
            <div className="flex items-center justify-start gap-2">
                <motion.span 
                    className={`text-lg font-bold font-serif transition-colors ${isFull ? 'text-yellow-300' : 'text-[#F777B6]'}`}
                    animate={isFull ? { scale: [1, 1.3, 1], transition: { duration: 1, repeat: Infinity }} : { scale: 1 }}
                >
                    🔥
                </motion.span>
                <div className="h-3 w-full bg-[#231E35] rounded-full overflow-hidden border border-[#FFD700]/50 shadow-inner">
                    <motion.div
                        className={`h-full rounded-full bg-gradient-to-r from-[#F777B6] to-[#FFD700] ${isFull ? 'animate-pulse' : ''}`}
                        style={{ boxShadow: isFull ? '0 0 8px #FFD700' : 'none' }}
                        initial={{ width: '0%' }}
                        animate={{ width: `${level}%` }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}
                    />
                </div>
            </div>
        </div>
    );
};

const Sparkle = ({ top, left, delay }) => (
    <motion.div
        className="absolute w-2 h-2 bg-yellow-300 rounded-full"
        style={{ top, left, boxShadow: '0 0 5px #fff, 0 0 10px #FFD700' }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
        transition={{ duration: 0.7, delay, ease: 'easeInOut' }}
    />
);

const SparkleBurst = () => {
    const sparkles = useMemo(() => Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * (2 * Math.PI);
        const radius = 20 + Math.random() * 20;
        return {
            top: `${50 - Math.sin(angle) * radius}%`,
            left: `${50 + Math.cos(angle) * radius}%`,
            delay: Math.random() * 0.3
        };
    }), []);

    return <div className="absolute inset-0">{sparkles.map((style, i) => <Sparkle key={i} {...style} />)}</div>;
};


const Modal = ({ isOpen, onClose, children, title }) => {
    const modalRef = useRef(null);

    // Accessibility: Trap focus, close on Escape, and restore focus on close
    useEffect(() => {
        if (!isOpen) return;

        const prevActiveElement = document.activeElement;

        // Defer focus to allow modal to render and animate in
        const timerId = setTimeout(() => {
            const firstFocusableElement = modalRef.current?.querySelector(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (firstFocusableElement) {
                firstFocusableElement.focus();
            } else {
                modalRef.current?.focus();
            }
        }, 100);

        const handleKeyDown = (event) => {
            // Close on escape
            if (event.key === 'Escape') {
                onClose();
                return;
            }

            // Focus trapping
            if (event.key === 'Tab' && modalRef.current) {
                const focusableElements = Array.from(modalRef.current.querySelectorAll(
                  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                ));
                if (focusableElements.length === 0) return;

                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];

                if (event.shiftKey) { // Shift + Tab
                    if (document.activeElement === firstElement) {
                        lastElement.focus();
                        event.preventDefault();
                    }
                } else { // Tab
                    if (document.activeElement === lastElement) {
                        firstElement.focus();
                        event.preventDefault();
                    }
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        // Cleanup function
        return () => {
            clearTimeout(timerId);
            document.removeEventListener('keydown', handleKeyDown);
            if (prevActiveElement && typeof prevActiveElement.focus === 'function') {
                prevActiveElement.focus();
            }
        };
    }, [isOpen, onClose]);


    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-lg" onClick={onClose}>
            <motion.div ref={modalRef} tabIndex="-1" className="outline-none bg-gradient-to-br from-[#2D2447] to-[#4B0082] w-full max-w-sm p-6 sm:p-8 rounded-[2rem] shadow-3xl border-4 border-[#FFD700] text-center" onClick={e => e.stopPropagation()} initial={{ scale: 0.5, opacity: 0, rotateX: 30 }} animate={{ scale: 1, opacity: 1, rotateX: 0 }} exit={{ scale: 0.5, opacity: 0, rotateX: -30 }} transition={{ type: "spring", stiffness: 100, damping: 15 }} role="dialog" aria-modal="true" aria-labelledby="modal-title">
                {title && <h2 id="modal-title" className="text-3xl font-bold text-[#FFD700] mb-4 font-serif tracking-wide">{title}</h2>}
                {children}
            </motion.div>
        </div>
    );
};

const PromptModal = (props) => (
    <Modal {...props} title={props.prompt.title}>
        <p className="text-[#C8BFE7] mb-8 min-h-[60px] font-sans text-lg sm:text-xl leading-relaxed italic">"{props.prompt.text}"</p>
        <div className="flex flex-col space-y-4">
            <motion.button onClick={() => { audioEngine.playCorrect(); props.onClose(); }} className="w-full bg-[#F777B6] hover:bg-[#E562A8] text-white font-bold py-3 sm:py-4 px-4 rounded-full text-lg shadow-lg shadow-[#F777B6]/40" whileHover={{ scale: 1.05, boxShadow: '0 0 20px #F777B6' }} whileTap={{ scale: 0.95 }}>Accept</motion.button>
            <motion.button onClick={() => { audioEngine.playRefuse(); props.onRefuse(); }} className="w-full bg-transparent border-2 border-[#FFD700] text-[#FFD700] font-bold py-3 sm:py-4 px-4 rounded-full text-lg hover:bg-[#FFD700]/10" whileHover={{ scale: 1.05, boxShadow: '0 0 20px #FFD700' }} whileTap={{ scale: 0.95 }}>Refuse</motion.button>
        </div>
    </Modal>
);

const ConsequenceModal = (props) => (
    <Modal {...props} title="The Price of Refusal!">
        <p className="text-[#FFD700] mb-8 min-h-[60px] font-sans text-lg sm:text-xl leading-relaxed"><span className="text-3xl">⚠️</span> {props.text} <span className="text-3xl">⚠️</span></p>
        <motion.button onClick={() => { audioEngine.playCorrect(); props.onClose(); }} className="w-full bg-[#FFD700] hover:bg-[#E5C300] text-[#4B0082] font-bold py-3 sm:py-4 px-4 rounded-full text-lg shadow-lg shadow-[#FFD700]/40" whileHover={{ scale: 1.05, boxShadow: '0 0 20px #FFD700' }} whileTap={{ scale: 0.95 }}>I Accept My Fate</motion.button>
    </Modal>
);

const ConfirmModal = (props) => (
    <Modal {...props} title={props.title}>
        <p className="text-[#C8BFE7] mb-8 min-h-[60px] font-sans text-lg sm:text-xl leading-relaxed">{props.message}</p>
        <div className="flex gap-4">
            <motion.button onClick={props.onClose} className="w-full bg-transparent border-2 border-[#FFD700] text-[#FFD700] font-bold py-3 px-4 rounded-full text-base sm:text-lg hover:bg-[#FFD700]/10" whileHover={{ scale: 1.05, boxShadow: '0 0 15px #FFD700' }} whileTap={{ scale: 0.95 }}>Cancel</motion.button>
            <motion.button onClick={() => { audioEngine.playCorrect(); props.onConfirm(); }} className="w-full bg-[#F777B6] hover:bg-[#E562A8] text-white font-bold py-3 px-4 rounded-full text-base sm:text-lg shadow-lg shadow-[#F777B6]/40" whileHover={{ scale: 1.05, boxShadow: '0 0 15px #F777B6' }} whileTap={{ scale: 0.95 }}>Confirm</motion.button>
        </div>
    </Modal>
);

const SettingsModal = ({ isOpen, onClose, settings, onSettingsChange, isMuted, onMuteToggle, onEditPrompts, onResetPrompts, onThemeChange, currentTheme, userId }) => {
    const themes = [
        { id: 'romanticNeon', name: 'Romantic Neon' },
        { id: 'playfulFun', name: 'Playful Fun' },
        { id: 'highStakes', name: 'High Stakes' }
    ];
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Settings">
            <div className="space-y-6 text-left text-sm">
                {/* Audio Settings */}
                <div className="space-y-4 p-4 bg-black/20 rounded-xl border border-white/10">
                    <h3 className="font-serif text-lg text-[#F777B6]">Audio Settings</h3>
                    <div>
                        <label className="font-bold text-[#FFD700]">👑 Master Volume</label>
                        <input type="range" min="0" max="100" value={settings.masterVolume} onChange={(e) => onSettingsChange({ masterVolume: parseInt(e.target.value) })} className="w-full h-2 bg-[#231E35] rounded-lg appearance-none cursor-pointer range-lg accent-[#F777B6]" />
                    </div>
                    <div>
                        <label className="font-bold text-[#FFD700]">🎵 Music Volume</label>
                        <input type="range" min="0" max="100" value={settings.musicVolume} onChange={(e) => onSettingsChange({ musicVolume: parseInt(e.target.value) })} className="w-full h-2 bg-[#231E35] rounded-lg appearance-none cursor-pointer range-lg accent-[#F777B6]" />
                    </div>
                    <div>
                        <label className="font-bold text-[#FFD700]">🔊 Effects Volume</label>
                        <input type="range" min="0" max="100" value={settings.sfxVolume} onChange={(e) => onSettingsChange({ sfxVolume: parseInt(e.target.value) })} className="w-full h-2 bg-[#231E35] rounded-lg appearance-none cursor-pointer range-lg accent-[#F777B6]" />
                    </div>
                     <motion.button onClick={onMuteToggle} className="w-full flex items-center justify-center gap-2 bg-transparent border-2 border-[#FFD700] text-[#FFD700] font-bold py-2 px-4 rounded-full text-base hover:bg-[#FFD700]/10" whileHover={{ scale: 1.05, boxShadow: '0 0 15px #FFD700' }} whileTap={{ scale: 0.95 }}>
                        <SpeakerIcon muted={isMuted} />
                        {isMuted ? 'Unmute All' : 'Mute All'}
                    </motion.button>
                </div>

                {/* Theme & Music */}
                <div className="space-y-3 p-4 bg-black/20 rounded-xl border border-white/10">
                    <h3 className="font-serif text-lg text-[#F777B6]">Theme & Music</h3>
                    <div className="grid grid-cols-2 gap-2">
                        {themes.map(theme => (
                            <motion.button 
                                key={theme.id} 
                                onClick={() => onThemeChange(theme.id)}
                                className={`py-2 px-3 text-xs font-semibold rounded-full transition-colors ${currentTheme === theme.id ? 'bg-[#FFD700] text-[#4B0082]' : 'bg-[#231E35] text-[#C8BFE7]/70 hover:bg-[#2D2447]'}`}
                                whileTap={{scale: 0.95}}
                            >
                                {theme.name}
                            </motion.button>
                        ))}
                    </div>
                </div>

                {/* Game Management */}
                <div className="space-y-3 p-4 bg-black/20 rounded-xl border border-white/10">
                    <h3 className="font-serif text-lg text-[#F777B6]">Game Management</h3>
                    <motion.button onClick={onEditPrompts} className="w-full flex items-center justify-center gap-2 bg-[#F777B6] text-white font-bold py-3 px-4 rounded-full text-base hover:bg-[#E562A8]" whileHover={{ scale: 1.05, boxShadow: '0 0 15px #F777B6' }} whileTap={{ scale: 0.95 }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        Customize Prompts
                    </motion.button>
                     <motion.button onClick={onResetPrompts} className="w-full text-sm text-[#F777B6] hover:text-[#FFC0CB]" whileTap={{ scale: 0.98 }}>Reset All Prompts to Defaults</motion.button>
                    {userId && <p className="text-[10px] text-center text-[#C8BFE7]/50 pt-2 break-all px-4">Session ID: {userId}</p>}
                </div>
            </div>
        </Modal>
    );
};


const EditorModal = ({ isOpen, onClose, prompts, onReset }) => {
    const [category, setCategory] = useState('truthPrompts');
    const [subCategory, setSubCategory] = useState('normal');
    const [editorPrompts, setEditorPrompts] = useState(prompts);
    const hasChanges = useMemo(() => JSON.stringify(editorPrompts) !== JSON.stringify(prompts), [editorPrompts, prompts]);

    useEffect(() => { setEditorPrompts(prompts); }, [prompts, isOpen]);
    
    useEffect(() => {
        if(editorPrompts[category]) {
            const firstSub = Object.keys(editorPrompts[category])[0];
            setSubCategory(firstSub);
        }
    }, [category]);

    const handlePromptChange = (sub, index, value) => { const newPrompts = structuredClone(editorPrompts); newPrompts[category][sub][index] = value; setEditorPrompts(newPrompts); };
    const handlePromptDelete = (sub, index) => { const newPrompts = structuredClone(editorPrompts); newPrompts[category][sub] = newPrompts[category][sub].filter((_, i) => i !== index); setEditorPrompts(newPrompts); };
    const handleAddPrompt = (sub) => { audioEngine.playUIConfirm(); const newPrompts = structuredClone(editorPrompts); newPrompts[category][sub].push(''); setEditorPrompts(newPrompts); };
    const handleCloseAndSave = () => { onClose(hasChanges ? editorPrompts : null); };

    const subCategoryKeys = ['truthPrompts', 'darePrompts', 'consequences'];

    return (
        <Modal isOpen={isOpen} onClose={() => onClose(null)} title="Customize Your Game">
            <div className="w-full h-[70vh] flex flex-col text-left">
                <div className="flex border-b border-[#FFD700]/30 mb-2 flex-shrink-0 overflow-x-auto pb-1">{Object.keys(prompts).map(key => (<motion.button key={key} className={`py-2 px-4 font-bold text-sm whitespace-nowrap rounded-t-lg transition-colors ${category === key ? 'text-[#FFD700] border-b-2 border-[#FFD700]' : 'text-[#C8BFE7]/50 hover:text-[#C8BFE7]/80'}`} onClick={() => { audioEngine.playWheelTick(); setCategory(key); }} whileTap={{ scale: 0.95 }}>{key.replace(/Prompts|Questions/g, '').toUpperCase()}</motion.button>))}</div>
                
                {subCategoryKeys.includes(category) && (
                    <div className="flex border-b border-[#F777B6]/20 mb-4 flex-shrink-0 overflow-x-auto pb-1">
                        {Object.keys(editorPrompts[category]).map(subKey => (
                            <motion.button key={subKey} className={`py-1 px-3 text-xs font-semibold rounded-full mr-2 transition-colors ${subCategory === subKey ? 'bg-[#F777B6] text-white' : 'bg-[#231E35] text-[#C8BFE7]/70 hover:bg-[#2D2447]'}`} onClick={() => { audioEngine.playWheelTick(); setSubCategory(subKey);}} whileTap={{scale: 0.95}}>{subKey}</motion.button>
                        ))}
                    </div>
                )}

                <div className="flex-grow overflow-y-auto pr-2 space-y-6">
                    {editorPrompts[category] && (subCategoryKeys.includes(category) 
                        ? (
                            <div className="bg-[#2D2447] p-4 rounded-xl border border-[#FFD700]/30 shadow-inner">
                                <div className="space-y-2">
                                    <AnimatePresence initial={false}>
                                        {(editorPrompts[category][subCategory] || []).map((prompt, index) => (
                                            <motion.div key={`${category}-${subCategory}-${index}`} className="flex items-center space-x-3 bg-[#231E35] p-2 rounded-xl border border-[#4B0082]" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                                                <input type="text" value={prompt} onChange={(e) => handlePromptChange(subCategory, index, e.target.value)} className="w-full bg-transparent text-[#FFD700] placeholder-[#C8BFE7]/50 focus:outline-none p-1 font-sans text-sm" />
                                                <motion.button onClick={() => { audioEngine.playRefuse(); handlePromptDelete(subCategory, index); }} aria-label="Delete prompt" whileTap={{ scale: 0.8 }}><TrashIcon /></motion.button>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                                <motion.button onClick={() => handleAddPrompt(subCategory)} className="w-full mt-3 text-[#FFD700] border border-dashed border-[#FFD700]/50 py-2 rounded-lg hover:bg-[#4B0082]" whileTap={{ scale: 0.98 }}>+ Add Prompt</motion.button>
                            </div>
                        ) 
                        : Object.entries(editorPrompts[category]).map(([group, list]) => (
                            <div key={group} className="bg-[#2D2447] p-4 rounded-xl border border-[#FFD700]/30 shadow-inner">
                                <h3 className="text-xl font-serif text-[#F777B6] capitalize mb-3 border-b border-[#F777B6]/30 pb-1">{group}</h3>
                                <div className="space-y-2">
                                    <AnimatePresence initial={false}>
                                        {list.map((prompt, index) => (
                                            <motion.div key={`${category}-${group}-${index}`} className="flex items-center space-x-3 bg-[#231E35] p-2 rounded-xl border border-[#4B0082]" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                                                <input type="text" value={prompt} onChange={(e) => handlePromptChange(group, index, e.target.value)} className="w-full bg-transparent text-[#FFD700] placeholder-[#C8BFE7]/50 focus:outline-none p-1 font-sans text-sm" />
                                                <motion.button onClick={() => { audioEngine.playRefuse(); handlePromptDelete(group, index); }} aria-label="Delete prompt" whileTap={{ scale: 0.8 }}><TrashIcon /></motion.button>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                                <motion.button onClick={() => handleAddPrompt(group)} className="w-full mt-3 text-[#FFD700] border border-dashed border-[#FFD700]/50 py-2 rounded-lg hover:bg-[#4B0082]" whileTap={{ scale: 0.98 }}>+ Add Prompt</motion.button>
                            </div>
                        ))
                    )}
                </div>
                <div className="mt-6 flex-shrink-0 space-y-3"><motion.button onClick={handleCloseAndSave} className="w-full bg-[#FFD700] hover:bg-[#E5C300] text-[#4B0082] font-bold py-3 px-4 rounded-full text-lg shadow-lg shadow-[#FFD700]/40" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>{hasChanges ? "Save & Close" : "Close"}</motion.button><motion.button onClick={onReset} className="w-full text-sm text-[#F777B6] hover:text-[#FFC0CB]" whileTap={{ scale: 0.98 }}>Reset All to Defaults</motion.button></div>
            </div>
        </Modal>
    );
};

const AudioUnlockScreen = ({ onUnlock, disabled }) => (
    <div className="min-h-screen bg-[#2D2447] text-white font-sans flex flex-col items-center justify-center p-4 overflow-hidden">
        {/* Keyframes for the romantic glow animation on the title text */}
        <style>{`
            @keyframes romantic-glow {
                0%, 100% { text-shadow: 0 0 8px #FFD700, 0 0 16px #FFD700, 0 0 24px #F777B6; }
                50% { text-shadow: 0 0 16px #FFD700, 0 0 24px #FFD700, 0 0 32px #F777B6, 0 0 40px #F777B6; }
            }
        `}</style>
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ duration: 1 }} 
            className="text-center"
        >
            <motion.h1 
                className="text-5xl md:text-7xl font-extrabold text-[#FFD700] tracking-widest font-serif drop-shadow-lg"
                style={{ animation: 'romantic-glow 4s ease-in-out infinite' }}
                initial={{ opacity: 0, scale: 0.7, y: -30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            >
                Date Night
            </motion.h1>
            <motion.p 
                className="text-[#F777B6] text-lg md:text-xl font-sans mt-2 mb-12 italic"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.8 }}
            >
                A Game of Intimate Challenges
            </motion.p>
            <motion.button 
                onClick={onUnlock} 
                disabled={disabled} 
                className="relative bg-[#F777B6] text-white font-bold py-4 px-12 rounded-full text-2xl shadow-lg shadow-[#F777B6]/40 disabled:opacity-50 overflow-hidden" 
                whileHover={!disabled ? { scale: 1.1, boxShadow: '0 0 35px #F777B6' } : {}} 
                whileTap={!disabled ? { scale: 0.9 } : {}}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 1.2, type: 'spring', stiffness: 120 }}
            >
                {/* Magical Shimmer Effect */}
                <motion.div 
                    className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-transparent to-white/40"
                    style={{ transform: 'skewX(-20deg) translateX(-200%)' }}
                    animate={{
                        translateX: ['-200%', '350%']
                    }}
                    transition={{
                        duration: 2.5,
                        ease: 'easeInOut',
                        repeat: Infinity,
                        repeatDelay: 3,
                        delay: 2
                    }}
                />
                <span className="relative z-10">Tap to Begin</span>
            </motion.button>
            {disabled && (<p className="text-red-400 mt-4 text-sm">Could not load audio library. Sound is disabled.</p>)}
        </motion.div>
    </div>
);

// --- MAIN APP COMPONENT ---
export default function App() {
    const { prompts, updatePrompts, isLoading, userId } = useFirestorePrompts();
    const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
    const [scriptLoadState, setScriptLoadState] = useState('loading');
    const [modalState, setModalState] = useState({ type: null, data: {} });
    const [currentTheme, setCurrentTheme] = useState('romanticNeon');
    
    const [settings, setSettings] = useState({ masterVolume: 100, musicVolume: 80, sfxVolume: 100 });
    const [isMuted, setIsMuted] = useState(false);

    const [sparkLevel, setSparkLevel] = useState(0);
    const [roundCount, setRoundCount] = useState(0);
    const [isExtremeMode, setIsExtremeMode] = useState(false);
    const [extremeRoundSource, setExtremeRoundSource] = useState(null);
    const [showExtremeIntro, setShowExtremeIntro] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);

    useEffect(() => {
        if (window.Tone) { setScriptLoadState('loaded'); return; }
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/tone@14.7.77/build/Tone.min.js";
        script.async = true;
        script.onload = () => { console.log("Tone.js script loaded."); setScriptLoadState('loaded'); };
        script.onerror = () => { console.error("Failed to load Tone.js."); setScriptLoadState('error'); };
        document.body.appendChild(script);
        return () => { if (script.parentNode) script.parentNode.removeChild(script); };
    }, []);
    
    useEffect(() => {
        if (modalState.type && modalState.type !== 'settings' && modalState.type !== 'editor' ) {
            audioEngine.playModalOpen();
        }
    }, [modalState.type]);

    // Accessibility: Hide background content from screen readers when modal is open
    useEffect(() => {
        const appContainer = document.getElementById('app-container');
        if (modalState.type) {
            appContainer?.setAttribute('aria-hidden', 'true');
        } else {
            appContainer?.removeAttribute('aria-hidden');
        }
    }, [modalState.type]);

    useEffect(() => {
        const convertToDb = (value) => (value === 0 ? -Infinity : (value / 100) * 40 - 40);
        audioEngine.setMasterVolume(convertToDb(settings.masterVolume));
        audioEngine.setMusicVolume(convertToDb(settings.musicVolume));
        audioEngine.setSfxVolume(convertToDb(settings.sfxVolume));
    }, [settings]);

    useEffect(() => {
        audioEngine.toggleMute(isMuted);
    }, [isMuted]);

    const handleUnlockAudio = async () => {
        if (scriptLoadState === 'loaded') {
            const success = await audioEngine.initialize();
            if (success) {
                audioEngine.startTheme(currentTheme);
                setIsAudioUnlocked(true);
            }
        } else {
            setIsAudioUnlocked(true);
        }
    };

    const handleToggleMute = () => setIsMuted(prev => !prev);
    
    const endRoundAndStartNew = () => {
        if (isExtremeMode) {
            setIsExtremeMode(false);
            if (extremeRoundSource === 'spark') {
                setSparkLevel(0);
            }
            setExtremeRoundSource(null);
            handleThemeChange('romanticNeon');
            return;
        }

        const newRoundCount = roundCount + 1;
        setRoundCount(newRoundCount);

        // Updated spark meter increment logic per user request
        let increment = 5;
        if (newRoundCount > 10) {
            increment = 20; // Late game
        } else if (newRoundCount > 5) {
            increment = 10; // Mid game
        }
        
        const newSparkLevel = Math.min(sparkLevel + increment, 100);
        setSparkLevel(newSparkLevel);

        if (newSparkLevel >= 100) {
            triggerExtremeRound('spark');
            return;
        }

        // Updated random chance for extreme round to ~17%
        if (Math.random() < 0.17) {
            triggerExtremeRound('random');
            return;
        }
    };

    const triggerExtremeRound = (source) => {
        audioEngine.playExtremePrompt();
        handleThemeChange('highStakes');
        setShowConfetti(true);
        setExtremeRoundSource(source);
        setShowExtremeIntro(true);
        setTimeout(() => {
            setShowExtremeIntro(false);
            setIsExtremeMode(true);
        }, 2500);
    };

    const handleThemeChange = (themeId) => {
        if (currentTheme !== themeId) {
            setCurrentTheme(themeId);
            audioEngine.startTheme(themeId);
        }
    };

    const handleCloseModal = () => {
        audioEngine.playModalClose();
        setModalState({ type: null, data: {} });
        endRoundAndStartNew();
    };

    const handleSpinFinish = (category) => {
        if (currentTheme !== 'romanticNeon' && !isExtremeMode) {
            handleThemeChange('romanticNeon');
        }

        const getList = () => {
            const { truthPrompts, darePrompts, triviaQuestions } = prompts;
            if (isExtremeMode) {
                switch(category) {
                    case 'truth': return [...(truthPrompts.extreme || [])];
                    case 'dare': return [...(darePrompts.extreme || [])];
                    default: return [];
                }
            } else {
                switch (category) {
                    case 'truth': return [...(truthPrompts.normal || []), ...(truthPrompts.spicy || [])];
                    case 'dare': return [...(darePrompts.normal || []), ...(darePrompts.spicy || [])];
                    case 'trivia': return [...(triviaQuestions.normal || [])];
                    default: return [];
                }
            }
        };
        const list = getList().filter(p => p && p.trim() !== '');
        const text = list.length > 0 ? list[Math.floor(Math.random() * list.length)] : 'No prompts here. Add some in the editor!';
        const title = { truth: 'The Velvet Truth...', dare: 'The Royal Dare!', trivia: 'The Trivia Challenge' }[category];
        setModalState({ type: 'prompt', data: { title, text } });
    };

    const handleRefuse = () => {
        const list = isExtremeMode 
            ? [...(prompts.consequences.extreme || [])]
            : [...(prompts.consequences.normal || []), ...(prompts.consequences.spicy || [])];
        
        const filteredList = list.filter(c => c && c.trim() !== '');
        const text = filteredList.length > 0 ? filteredList[Math.floor(Math.random() * filteredList.length)] : "Add consequences in the editor!";
        setModalState({ type: 'consequence', data: { text } });
    };
    
    const handleEditorClose = (updatedPrompts) => {
        if (updatedPrompts) {
            audioEngine.playCorrect();
            updatePrompts(updatedPrompts);
        } else {
            audioEngine.playModalClose();
        }
        setModalState({ type: null, data: {} });
    };
    
    const handleConfirmReset = () => {
        audioEngine.playRefuse();
        updatePrompts(defaultPrompts);
        setModalState({ type: 'editor' });
    };

    if (isLoading || (scriptLoadState === 'loading' && !isAudioUnlocked)) {
        return <div className="min-h-screen bg-[#2D2447] flex items-center justify-center"><p className="text-[#FFD700] text-3xl font-serif animate-pulse">{isLoading ? "Loading Prompts..." : "Initializing..."}</p></div>;
    }

    if (!isAudioUnlocked) {
        return <AudioUnlockScreen onUnlock={handleUnlockAudio} disabled={scriptLoadState === 'error'} />;
    }

    return (
        <div id="app-container" className="min-h-screen bg-gradient-to-br from-[#1a162c] to-[#2D2447] text-white font-sans flex flex-col items-center justify-center p-4 overflow-hidden relative">
            {/* Added keyframes for new animations */}
            <style>{`
                @keyframes fiery-text {
                    0%, 100% { color: #FFD700; text-shadow: 0 0 10px #F777B6, 0 0 20px #F777B6, 0 0 40px #FF4500, 0 0 80px #FF4500; }
                    50% { color: #FF4500; text-shadow: 0 0 10px #FFD700, 0 0 20px #F777B6, 0 0 30px #FFD700, 0 0 60px #FF4500; }
                }
                @keyframes background-pulse {
                    0% { background-color: rgba(75, 0, 130, 0.4); }
                    50% { background-color: rgba(139, 0, 0, 0.6); }
                    100% { background-color: rgba(75, 0, 130, 0.4); }
                }
            `}</style>
            <ParticleBackground />
            {showConfetti && <Confetti onFinish={() => setShowConfetti(false)} />}
            <SparkMeter level={sparkLevel} />
            <motion.button 
                onClick={() => {
                    audioEngine.playUIConfirm();
                    setModalState({ type: 'settings' });
                }} 
                className="fixed top-4 right-4 md:top-6 md:right-6 z-[60] text-[#FFD700] hover:text-yellow-300 bg-black/40 backdrop-blur-md border border-white/20 p-3 rounded-full shadow-lg"
                whileTap={{ scale: 0.9, rotate: -15 }} whileHover={{ scale: 1.1, rotate: 15, boxShadow: '0 0 20px #FFD700' }}
                aria-label="Settings"
            >
                <SettingsIcon />
            </motion.button>
            <motion.main className={`relative bg-gradient-to-br from-[#2D2447] to-[#4B0082] w-full max-w-lg mx-auto rounded-3xl shadow-3xl p-6 sm:p-8 md:p-10 text-center z-10 border-4 border-[#FFD700]/50 transition-all duration-500 ${isExtremeMode ? 'border-red-500 shadow-[0_0_30px_#FF4500]' : ''}`} initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, type: "spring" }}>
                <header className="relative mb-4">
                    <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-[#FFD700] tracking-widest font-serif drop-shadow-lg shadow-pink-500/50">Date Night</h1>
                    <p className="text-[#F777B6] text-base sm:text-lg md:text-xl font-sans mt-2 italic">A Game of Intimate Challenges</p>
                </header>

                {isExtremeMode && !showExtremeIntro && (
                    <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="my-4">
                        <h2 className="text-3xl font-bold font-serif tracking-widest" style={{ animation: 'fiery-text 2s ease-in-out infinite' }}>🔥 EXTREME ROUND 🔥</h2>
                    </motion.div>
                )}

                <Wheel 
                    onSpinFinish={handleSpinFinish} 
                    playWheelSpinStart={audioEngine.playClick}
                    playWheelTick={audioEngine.playWheelTick}
                    playWheelStop={audioEngine.playWheelStopSound}
                    isExtremeMode={isExtremeMode}
                />

                <div className="flex justify-center mt-6 space-x-6 h-6">
                    {/* This div is intentionally empty as buttons were moved to the settings modal */}
                </div>
            </motion.main>
            <AnimatePresence>
                {showExtremeIntro && (
                     <motion.div 
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                        style={{ animation: 'background-pulse 2s ease-in-out infinite' }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    >
                        <motion.h2 
                            className="text-5xl sm:text-6xl md:text-8xl font-extrabold font-serif tracking-widest drop-shadow-lg"
                            style={{ animation: 'fiery-text 2s ease-in-out infinite' }}
                            initial={{ scale: 0.5, y: 50, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1, transition: { type: 'spring', stiffness: 100, delay: 0.3 } }}
                        >
                            🔥 EXTREME ROUND! 🔥
                        </motion.h2>
                    </motion.div>
                )}
                {modalState.type === 'prompt' && <PromptModal isOpen={true} onClose={handleCloseModal} prompt={modalState.data} onRefuse={handleRefuse} />}
                {modalState.type === 'consequence' && <ConsequenceModal isOpen={true} onClose={handleCloseModal} text={modalState.data.text} />}
                {modalState.type === 'editor' && <EditorModal isOpen={true} onClose={handleEditorClose} prompts={prompts} onReset={() => setModalState({ type: 'confirmReset' })} />}
            	 {modalState.type === 'settings' && <SettingsModal 
                	 	isOpen={true} 
                	 	onClose={() => setModalState({ type: null })} 
                	 	settings={settings} 
                	 	onSettingsChange={(newSettings) => setSettings(prev => ({...prev, ...newSettings}))} 
                	 	isMuted={isMuted} 
                	 	onMuteToggle={handleToggleMute} 
                	 	onEditPrompts={() => setModalState({ type: 'editor' })}
            	 	 	onResetPrompts={() => setModalState({ type: 'confirmReset' })}
            	 	 	onThemeChange={handleThemeChange}
            	 	 	currentTheme={currentTheme}
            	 	 	userId={userId}
            	 	/>}
                {modalState.type === 'confirmReset' && <ConfirmModal isOpen={true} onClose={() => { audioEngine.playModalClose(); setModalState({ type: 'settings' }); }} onConfirm={handleConfirmReset} title="Confirm Reset" message="Are you sure? This will replace all prompts with the defaults." />}
            </AnimatePresence>
        </div>
    );
}


