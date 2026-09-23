// ==UserScript==
// @name         GeoFS Failures - Realistic
// @namespace    https://www.geo-fs.com/
// @version      0.3.11
// @description  Realistic manual aircraft failures for GeoFS with a polished aviation-style interface.
// @match        https://www.geo-fs.com/*
// @match        https://geo-fs.com/*
// @match        https://beta.geo-fs.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    /*
     * ============================================================
     * GeoFS Failures
     * ============================================================
     *
     * 0.3.11
     *
     * Electrical failure:
     *
     *  - Cockpit geometry remains visible.
     *  - Instrument displays are blacked out.
     *  - Virtual instruments are hidden where possible.
     *  - Autopilot is disconnected and locked out.
     *  - RESET ALL restores the original state.
     *
     * Existing engine failure, engine smoke, gear failure,
     * fuel leak, flight-control failures, UI and other systems
     * remain unchanged.
     */

    const ID = 'geofs-realistic-failures';

    if (document.getElementById(ID)) {
        return;
    }

    const VERSION = '0.3.11';

    // ============================================================
    // FAILURE STATE
    // ============================================================

    const F = {
        engine1: false,
        engine2: false,
        engine3: false,
        engine4: false,

        gearStuck: false,

        fuelLeak: false,

        flaps: false,
        spoilers: false,
        brakes: false,

        electrical: false
    };

    // ============================================================
    // RUNTIME STATE
    // ============================================================

    const runtime = {

        aircraft: null,

        engines: new Map(),

        gear: {
            nose: null,
            left: null,
            right: null
        },

        gearOriginals: new Map(),

        controls: {
            flaps: null,
            spoilers: null,
            brakes: null,
            gear: null
        },

        smoke: new Map(),

        electrical: {

            /*
             * Instrument records used by the electrical blackout.
             */
            instruments: new Map(),

            /*
             * Black DOM barriers placed over instrument displays.
             */
            blackouts: [],

            /*
             * Original global instruments.show/hide methods.
             */
            instrumentsShow: null,
            instrumentsHide: null,

            /*
             * Original autopilot methods.
             */
            autopilotTargets: [],

            /*
             * Original controls autopilot methods.
             */
            controlsAutopilotTargets: [],

            /*
             * Original toggleAutoPilot setter.
             */
            toggleAutoPilotOriginal: null,

            /*
             * Whether the electrical system has been captured.
             */
            captured: false
        },

        fuel: {
            property: null,
            original: null,

            /*
             * Compatibility reference to the first fuel vapor emitter.
             */
            leakEmitter: null,

            /*
             * One vapor emitter per detected engine.
             */
            leakEmitters: null,

            /*
             * Kept for compatibility with the previous version.
             */
            leakAnchor: null
        },

        fuelAccumulator: 0,

        aircraftId: null
    };

    let frameCallback = null;
    let bootTimer = null;

    // ============================================================
    // BASIC HELPERS
    // ============================================================

    function getAircraft() {
        return window.geofs?.aircraft?.instance || null;
    }

    function getControls() {
        return window.controls || null;
    }

    function finite(value) {
        return typeof value === 'number' &&
            Number.isFinite(value);
    }

    function clamp(value, min, max) {
        return Math.max(
            min,
            Math.min(max, value)
        );
    }

    function lower(value) {
        return String(value || '').toLowerCase();
    }

    function safe(callback, fallback = undefined) {
        try {
            return callback();
        } catch {
            return fallback;
        }
    }

    // ============================================================
    // CONTROL LOOKUP
    // ============================================================

    function findControl(names) {

        const c = getControls();

        if (!c) {
            return null;
        }

        for (const name of names) {

            if (
                c[name] !== undefined &&
                c[name] !== null
            ) {
                return c[name];
            }
        }

        return null;
    }

    // ============================================================
    // ENGINE DISCOVERY
    // ============================================================

    function getEngines(
        ac = getAircraft()
    ) {

        if (!ac?.engines) {
            return [];
        }

        if (Array.isArray(ac.engines)) {
            return ac.engines;
        }

        return Object.keys(ac.engines)
            .map(key => ac.engines[key])
            .filter(Boolean);
    }

    function engineCount() {
        return getEngines().length;
    }

    function captureEngine(
        engine,
        index
    ) {

        if (
            !engine ||
            runtime.engines.has(index)
        ) {
            return;
        }

        runtime.engines.set(
            index,
            {
                thrust: engine.thrust,
                thrustTarget:
                    engine.thrustTarget,

                power: engine.power,
                powerTarget:
                    engine.powerTarget,

                failed: engine.failed
            }
        );
    }

    // ============================================================
    // ENGINE FAILURE
    // ============================================================

    function enforceEngineFailure(index) {

        const engines =
            getEngines();

        const engine =
            engines[index];

        if (!engine) {
            return;
        }

        captureEngine(
            engine,
            index
        );

        safe(() => {

            if ('failed' in engine) {
                engine.failed = true;
            }

        });

        safe(() => {

            if ('thrust' in engine) {
                engine.thrust = 0;
            }

        });

        safe(() => {

            if ('thrustTarget' in engine) {
                engine.thrustTarget = 0;
            }

        });

        safe(() => {

            if ('power' in engine) {
                engine.power = 0;
            }

        });

        safe(() => {

            if ('powerTarget' in engine) {
                engine.powerTarget = 0;
            }

        });
    }

    function restoreEngine(index) {

        const engines =
            getEngines();

        const engine =
            engines[index];

        const original =
            runtime.engines.get(index);

        if (
            !engine ||
            !original
        ) {
            return;
        }

        safe(() => {

            if ('failed' in engine) {

                engine.failed =
                    original.failed !==
                    undefined
                        ? original.failed
                        : false;
            }

        });

        safe(() => {

            if (
                'thrust' in engine &&
                finite(original.thrust)
            ) {
                engine.thrust =
                    original.thrust;
            }

        });

        safe(() => {

            if (
                'thrustTarget' in engine &&
                finite(original.thrustTarget)
            ) {
                engine.thrustTarget =
                    original.thrustTarget;
            }

        });

        safe(() => {

            if (
                'power' in engine &&
                finite(original.power)
            ) {
                engine.power =
                    original.power;
            }

        });

        safe(() => {

            if (
                'powerTarget' in engine &&
                finite(original.powerTarget)
            ) {
                engine.powerTarget =
                    original.powerTarget;
            }

        });
    }

    // ============================================================
    // ENGINE SMOKE
    // ============================================================

    function createEngineSmoke(index) {

        if (runtime.smoke.has(index)) {
            return;
        }

        const geofs =
            window.geofs;

        if (
            typeof geofs?.fx?.ParticleEmitter !==
            'function'
        ) {
            return;
        }

        const engines =
            getEngines();

        const engine =
            engines[index];

        if (!engine) {
            return;
        }

        const anchor =
            engine?.points?.contrailAnchor ||
            (
                engine?.object3d?.worldPosition
                    ? {
                        worldPosition:
                            engine.object3d
                                .worldPosition
                    }
                    : null
            );

        if (!anchor) {
            return;
        }

        const emitter =
            safe(() => {

                return new geofs.fx.ParticleEmitter({

                    off: 0,

                    anchor,

                    duration: 1e10,

                    rate: 0.03,

                    life: 1e4,

                    easing: 'easeOutQuart',

                    startScale: 0.01,

                    endScale: 0.20,

                    randomizeStartScale:
                        0.01,

                    randomizeEndScale:
                        0.15,

                    startOpacity: 1,

                    endOpacity: 0.2,

                    startRotation:
                        'random',

                    texture:
                        'whitesmoke'
                });

            }, null);

        if (!emitter) {
            return;
        }

        runtime.smoke.set(
            index,
            emitter
        );
    }

    function darkenEngineSmoke() {

        const fx =
            window.geofs?.fx;

        if (
            typeof fx?.setParticlesColor !==
            'function'
        ) {
            return;
        }

        safe(() => {

            fx.setParticlesColor(
                new window.Cesium.Color(
                    0.10,
                    0.10,
                    0.10,
                    1
                )
            );

        });
    }

    function destroyEngineSmoke(index) {

        const emitter =
            runtime.smoke.get(index);

        if (!emitter) {
            return;
        }

        safe(() => {

            if (
                typeof emitter.stop ===
                'function'
            ) {
                emitter.stop();
            }

        });

        safe(() => {

            if (
                typeof emitter.destroy ===
                'function'
            ) {
                emitter.destroy();
            }

        });

        runtime.smoke.delete(index);
    }

    // ============================================================
    // LANDING GEAR
    // ============================================================

    function enforceGearStuck() {

        if (!F.gearStuck) {
            return;
        }

        const controlsObject =
            getControls();

        if (!controlsObject?.gear) {
            return;
        }

        const gear =
            controlsObject.gear;

        safe(() => {

            if ('target' in gear) {
                gear.target = 1;
            }

        });

        safe(() => {

            if ('positionTarget' in gear) {
                gear.positionTarget = 1;
            }

        });

        safe(() => {

            if ('position' in gear) {
                gear.position = 1;
            }

        });

        safe(() => {

            if (
                typeof controlsObject
                    .setPartAnimationDelta ===
                'function'
            ) {

                controlsObject
                    .setPartAnimationDelta(
                        gear
                    );
            }

        });
    }

    // ============================================================
    // FLAPS
    // ============================================================

    function enforceFlapFailure() {

        if (!F.flaps) {
            return;
        }

        const flap =
            runtime.controls.flaps ||
            findControl([
                'flaps'
            ]);

        runtime.controls.flaps =
            flap;

        if (!flap) {
            return;
        }

        safe(() => {

            if ('positionTarget' in flap) {
                flap.positionTarget = 0;
            }

        });

        safe(() => {

            if ('target' in flap) {
                flap.target = 0;
            }

        });

        safe(() => {

            if ('position' in flap) {
                flap.position = 0;
            }

        });

        safe(() => {

            if ('value' in flap) {
                flap.value = 0;
            }

        });

        const controlsObject =
            getControls();

        safe(() => {

            if (
                typeof controlsObject
                    ?.setPartAnimationDelta ===
                'function'
            ) {

                controlsObject
                    .setPartAnimationDelta(
                        flap
                    );
            }

        });
    }

    // ============================================================
    // SPOILERS
    // ============================================================

    function enforceSpoilerFailure() {

        if (!F.spoilers) {
            return;
        }

        const spoiler =
            runtime.controls.spoilers ||
            findControl([
                'airbrakes',
                'spoilers'
            ]);

        runtime.controls.spoilers =
            spoiler;

        if (!spoiler) {
            return;
        }

        const time =
            (performance.now() / 1000) % 3.2;

        let failedPosition;

        if (time < 0.8) {

            const progress =
                time / 0.8;

            failedPosition =
                0.35 * progress;

        } else if (time < 1.4) {

            const progress =
                (time - 0.8) / 0.6;

            failedPosition =
                0.35 -
                (0.27 * progress);

        } else if (time < 2.3) {

            const progress =
                (time - 1.4) / 0.9;

            failedPosition =
                0.08 +
                (0.92 * progress);

        } else {

            const progress =
                (time - 2.3) / 0.9;

            failedPosition =
                1 -
                progress;
        }

        const smoothPosition =
            failedPosition *
            failedPosition *
            (3 - 2 * failedPosition);

        safe(() => {

            if ('positionTarget' in spoiler) {
                spoiler.positionTarget =
                    smoothPosition;
            }

        });

        safe(() => {

            if ('target' in spoiler) {
                spoiler.target =
                    smoothPosition;
            }

        });

        safe(() => {

            if ('position' in spoiler) {
                spoiler.position =
                    smoothPosition;
            }

        });

        safe(() => {

            if ('value' in spoiler) {
                spoiler.value =
                    smoothPosition;
            }

        });

        const controlsObject =
            getControls();

        safe(() => {

            if (
                typeof controlsObject
                    ?.setPartAnimationDelta ===
                'function'
            ) {

                controlsObject
                    .setPartAnimationDelta(
                        spoiler
                    );
            }

        });
    }

    // ============================================================
    // BRAKES
    // ============================================================

    function enforceBrakeFailure() {

        if (!F.brakes) {
            return;
        }

        const controlsObject =
            getControls();

        const brake =
            runtime.controls.brakes ||
            findControl([
                'brakes',
                'brake'
            ]);

        runtime.controls.brakes =
            brake;

        if (brake) {

            safe(() => {

                if ('positionTarget' in brake) {
                    brake.positionTarget = 0;
                }

            });

            safe(() => {

                if ('target' in brake) {
                    brake.target = 0;
                }

            });

            safe(() => {

                if ('position' in brake) {
                    brake.position = 0;
                }

            });

            safe(() => {

                if ('value' in brake) {
                    brake.value = 0;
                }

            });

            safe(() => {

                if (
                    typeof controlsObject
                        ?.setPartAnimationDelta ===
                    'function'
                ) {

                    controlsObject
                        .setPartAnimationDelta(
                            brake
                        );
                }

            });
        }

        safe(() => {

            if (
                controlsObject &&
                typeof controlsObject.brakes ===
                'number'
            ) {

                controlsObject.brakes = 0;
            }

        });

        safe(() => {

            if (
                controlsObject &&
                typeof controlsObject.brake ===
                'number'
            ) {

                controlsObject.brake = 0;
            }

        });
    }

    // ============================================================
    // FUEL
    // ============================================================

    function discoverFuelProperty(ac) {

        if (!ac) {
            return null;
        }

        const candidates = [
            'fuel',
            'fuelQuantity',
            'fuelLevel'
        ];

        for (
            const property
            of candidates
        ) {

            if (
                typeof ac[property] ===
                'number'
            ) {
                return property;
            }
        }

        return null;
    }

    function getEngineVaporAnchor(engine) {

        if (!engine) {
            return null;
        }

        return (
            engine?.points?.contrailAnchor ||
            (
                engine?.object3d?.worldPosition
                    ? {
                        worldPosition:
                            engine.object3d
                                .worldPosition
                    }
                    : null
            )
        );
    }

    function createFuelLeakEmitter(anchor) {

        if (!anchor) {
            return null;
        }

        const geofs =
            window.geofs;

        if (
            typeof geofs?.fx?.ParticleEmitter !==
            'function'
        ) {
            return null;
        }

        return safe(() => {

            return new geofs.fx.ParticleEmitter({

                off: 0,

                anchor,

                duration:
                    1e10,

                rate:
                    0.12,

                life:
                    5,

                easing:
                    'easeOutQuart',

                startScale:
                    0.025,

                endScale:
                    0.35,

                randomizeStartScale:
                    0.012,

                randomizeEndScale:
                    0.20,

                startOpacity:
                    0.72,

                endOpacity:
                    0.02,

                startRotation:
                    'random',

                texture:
                    'whitesmoke'
            });

        }, null);
    }

    function createFuelLeakTrail() {

        if (
            runtime.fuel.leakEmitters &&
            runtime.fuel.leakEmitters.length
        ) {
            return;
        }

        const engines =
            getEngines();

        if (!engines.length) {
            return;
        }

        const emitters = [];

        for (
            let i = 0;
            i < engines.length;
            i++
        ) {

            const anchor =
                getEngineVaporAnchor(
                    engines[i]
                );

            if (!anchor) {
                continue;
            }

            const emitter =
                createFuelLeakEmitter(
                    anchor
                );

            if (emitter) {
                emitters.push(
                    emitter
                );
            }
        }

        if (!emitters.length) {
            return;
        }

        runtime.fuel.leakEmitters =
            emitters;

        runtime.fuel.leakEmitter =
            emitters[0];

        runtime.fuel.leakAnchor =
            getEngineVaporAnchor(
                engines[0]
            );
    }

    function destroyFuelLeakTrail() {

        const emitters =
            runtime.fuel.leakEmitters ||
            [];

        for (
            const emitter
            of emitters
        ) {

            safe(() => {
                emitter.stop?.();
            });

            safe(() => {
                emitter.destroy?.();
            });
        }

        if (
            runtime.fuel.leakEmitter &&
            !emitters.includes(
                runtime.fuel.leakEmitter
            )
        ) {

            safe(() => {
                runtime.fuel.leakEmitter.stop?.();
            });

            safe(() => {
                runtime.fuel.leakEmitter.destroy?.();
            });
        }

        runtime.fuel.leakEmitter =
            null;

        runtime.fuel.leakEmitters =
            null;

        runtime.fuel.leakAnchor =
            null;
    }

    function enforceFuelLeak(
        deltaSeconds
    ) {

        const ac =
            getAircraft();

        if (!ac) {
            return;
        }

        if (!F.fuelLeak) {

            destroyFuelLeakTrail();

            return;
        }

        createFuelLeakTrail();

        if (!runtime.fuel.property) {

            runtime.fuel.property =
                discoverFuelProperty(
                    ac
                );
        }

        const property =
            runtime.fuel.property;

        if (!property) {
            return;
        }

        const current =
            ac[property];

        if (!finite(current)) {
            return;
        }

        const leakRate =
            0.025;

        safe(() => {

            ac[property] =
                Math.max(
                    0,
                    current -
                    leakRate *
                    deltaSeconds
                );

        });
    }

    // ============================================================
    // ELECTRICAL BLACKOUT
    // ============================================================

    /*
     * The old electrical system scaled every cockpit part to:
     *
     *     [0, 0, 0]
     *
     * That made the ENTIRE cockpit disappear.
     *
     * This version does NOT touch cockpitSetup.parts.
     *
     * Instead we:
     *
     *  1. Black out instrument display DOM elements.
     *  2. Hide virtual instruments where possible.
     *  3. Keep enforcing the blackout while failed.
     *  4. Disconnect and lock the autopilot.
     *  5. Restore everything on reset.
     */

    function getDomElement(value) {

        if (!value) {
            return null;
        }

        if (value.nodeType === 1) {
            return value;
        }

        if (
            value.jquery &&
            value.length &&
            value[0]?.nodeType === 1
        ) {
            return value[0];
        }

        if (
            Array.isArray(value) &&
            value[0]?.nodeType === 1
        ) {
            return value[0];
        }

        return null;
    }

    function getInstrumentCollection() {

        return window.instruments?.list ||
            null;
    }

    function makeBlackoutForElement(element) {

        const target =
            getDomElement(element);

        if (!target) {
            return null;
        }

        /*
         * Avoid duplicate barriers.
         */
        if (
            target.dataset &&
            target.dataset.geofsElectricalBlackout ===
            '1'
        ) {
            return null;
        }

        const computed =
            safe(() =>
                window.getComputedStyle(target),
                null
            );

        const previousPosition =
            target.style.position;

        if (
            computed &&
            computed.position === 'static' &&
            !previousPosition
        ) {

            target.style.position =
                'relative';
        }

        const barrier =
            document.createElement('div');

        barrier.className =
            `${ID}-screen-blackout`;

        barrier.style.position =
            'absolute';

        barrier.style.left =
            '0';

        barrier.style.top =
            '0';

        barrier.style.right =
            '0';

        barrier.style.bottom =
            '0';

        barrier.style.width =
            '100%';

        barrier.style.height =
            '100%';

        barrier.style.background =
            '#000';

        barrier.style.opacity =
            '1';

        barrier.style.zIndex =
            '2147483646';

        barrier.style.pointerEvents =
            'none';

        barrier.style.display =
            'block';

        barrier.setAttribute(
            'aria-hidden',
            'true'
        );

        safe(() => {
            target.appendChild(
                barrier
            );
        });

        if (
            !barrier.parentNode
        ) {
            return null;
        }

        if (target.dataset) {
            target.dataset
                .geofsElectricalBlackout =
                '1';
        }

        return {
            target,
            barrier,
            previousPosition
        };
    }

    function findInstrumentDisplayElements(
        instrument
    ) {

        const results = [];

        if (!instrument) {
            return results;
        }

        /*
         * GeoFS instruments expose an indicator.
         * That is the safest DOM element to black out.
         */
        const indicator =
            getDomElement(
                instrument.indicator
            );

        if (indicator) {
            results.push(indicator);
        }

        /*
         * Some instruments may expose a container.
         * Only use it when there is no indicator.
         */
        if (!results.length) {

            const container =
                getDomElement(
                    instrument.container
                );

            if (container) {
                results.push(container);
            }
        }

        return results;
    }

    function captureElectricalInstruments() {

        const collection =
            getInstrumentCollection();

        if (!collection) {
            return;
        }

        for (
            const name
            of Object.keys(collection)
        ) {

            const instrument =
                collection[name];

            if (!instrument) {
                continue;
            }

            if (
                !runtime.electrical
                    .instruments
                    .has(name)
            ) {

                runtime.electrical
                    .instruments
                    .set(
                        name,
                        {
                            instrument,

                            show:
                                typeof instrument.show ===
                                'function'
                                    ? instrument.show
                                    : null,

                            hide:
                                typeof instrument.hide ===
                                'function'
                                    ? instrument.hide
                                    : null
                        }
                    );
            }

            /*
             * Add the black display barrier.
             */
            for (
                const element
                of findInstrumentDisplayElements(
                    instrument
                )
            ) {

                const blackout =
                    makeBlackoutForElement(
                        element
                    );

                if (blackout) {

                    runtime.electrical
                        .blackouts
                        .push(
                            blackout
                        );
                }
            }

            /*
             * Hide the normal virtual instrument.
             */
            safe(() => {
                instrument.hide?.();
            });

            /*
             * Prevent an individual instrument from being
             * manually shown while electrical failure is active.
             */
            const record =
                runtime.electrical
                    .instruments
                    .get(name);

            if (
                record &&
                record.show &&
                instrument.show === record.show
            ) {

                const originalShow =
                    record.show;

                instrument.show =
                    function (...args) {

                        if (F.electrical) {
                            safe(() => {
                                instrument.hide?.();
                            });

                            return;
                        }

                        return originalShow.apply(
                            this,
                            args
                        );
                    };
            }
        }
    }

    function restoreElectricalInstruments() {

        for (
            const [
                name,
                record
            ]
            of runtime.electrical
                .instruments
        ) {

            const instrument =
                record.instrument;

            if (!instrument) {
                continue;
            }

            if (record.show) {

                safe(() => {

                    instrument.show =
                        record.show;

                });
            }

            if (record.hide) {

                safe(() => {

                    instrument.hide =
                        record.hide;

                });
            }
        }

        runtime.electrical
            .instruments
            .clear();
    }

    function restoreElectricalBlackouts() {

        for (
            const record
            of runtime.electrical
                .blackouts
        ) {

            const target =
                record.target;

            const barrier =
                record.barrier;

            safe(() => {

                if (
                    barrier &&
                    barrier.parentNode
                ) {

                    barrier.parentNode
                        .removeChild(
                            barrier
                        );
                }

            });

            safe(() => {

                if (
                    target?.dataset
                ) {

                    delete target
                        .dataset
                        .geofsElectricalBlackout;

                }

            });

            /*
             * Only restore the position if we changed it.
             */
            if (
                target &&
                record.previousPosition ===
                ''
            ) {

                safe(() => {

                    target.style.position =
                        '';

                });
            }
        }

        runtime.electrical
            .blackouts = [];
    }

    // ============================================================
    // AUTOPILOT LOCK
    // ============================================================

    function captureAutopilotTarget(
        object,
        methodName,
        collection
    ) {

        if (
            !object ||
            typeof object[methodName] !==
            'function'
        ) {
            return;
        }

        /*
         * Do not capture the same function twice.
         */
        if (
            collection.some(
                record =>
                    record.object === object &&
                    record.methodName === methodName
            )
        ) {
            return;
        }

        const original =
            object[methodName];

        collection.push({
            object,
            methodName,
            original
        });

        object[methodName] =
            function (...args) {

                if (F.electrical) {
                    return;
                }

                return original.apply(
                    this,
                    args
                );
            };
    }

    function captureAutopilotLock() {

        const geofsAutopilot =
            window.geofs?.autopilot;

        captureAutopilotTarget(
            geofsAutopilot,
            'turnOn',
            runtime.electrical
                .autopilotTargets
        );

        captureAutopilotTarget(
            geofsAutopilot,
            'toggle',
            runtime.electrical
                .autopilotTargets
        );

        const controlsObject =
            getControls();

        const controlsAutopilot =
            controlsObject?.autopilot;

        captureAutopilotTarget(
            controlsAutopilot,
            'turnOn',
            runtime.electrical
                .controlsAutopilotTargets
        );

        captureAutopilotTarget(
            controlsAutopilot,
            'toggle',
            runtime.electrical
                .controlsAutopilotTargets
        );

        /*
         * Some GeoFS versions expose the autopilot toggle
         * through controls.setters.
         */
        const setter =
            controlsObject?.setters
                ?.toggleAutoPilot;

        if (
            typeof setter ===
            'function' &&
            !runtime.electrical
                .toggleAutoPilotOriginal
        ) {

            runtime.electrical
                .toggleAutoPilotOriginal =
                setter;

            controlsObject
                .setters
                .toggleAutoPilot =
                function (...args) {

                    if (F.electrical) {
                        return;
                    }

                    return setter.apply(
                        this,
                        args
                    );
                };
        }
    }

    function enforceAutopilotOff() {

        safe(() => {

            if (
                typeof window.geofs
                    ?.autopilot
                    ?.turnOff ===
                'function'
            ) {

                window.geofs
                    .autopilot
                    .turnOff();
            }

        });

        safe(() => {

            if (
                typeof window.controls
                    ?.autopilot
                    ?.turnOff ===
                'function'
            ) {

                window.controls
                    .autopilot
                    .turnOff();
            }

        });
    }

    function restoreAutopilotLock() {

        for (
            const record
            of runtime.electrical
                .autopilotTargets
        ) {

            safe(() => {

                record.object[
                    record.methodName
                ] =
                    record.original;

            });
        }

        for (
            const record
            of runtime.electrical
                .controlsAutopilotTargets
        ) {

            safe(() => {

                record.object[
                    record.methodName
                ] =
                    record.original;

            });
        }

        const controlsObject =
            getControls();

        if (
            controlsObject?.setters &&
            runtime.electrical
                .toggleAutoPilotOriginal
        ) {

            safe(() => {

                controlsObject
                    .setters
                    .toggleAutoPilot =
                    runtime.electrical
                        .toggleAutoPilotOriginal;

            });
        }

        runtime.electrical
            .autopilotTargets = [];

        runtime.electrical
            .controlsAutopilotTargets = [];

        runtime.electrical
            .toggleAutoPilotOriginal =
            null;
    }

    function enforceElectricalFailure() {

        if (!F.electrical) {
            return;
        }

        captureElectricalInstruments();

        captureAutopilotLock();

        enforceAutopilotOff();

        /*
         * Keep the black barriers alive.
         *
         * This also catches instruments that GeoFS creates
         * after the initial electrical failure.
         */
        const collection =
            getInstrumentCollection();

        if (collection) {

            for (
                const name
                of Object.keys(collection)
            ) {

                const instrument =
                    collection[name];

                if (!instrument) {
                    continue;
                }

                safe(() => {
                    instrument.hide?.();
                });

                for (
                    const element
                    of findInstrumentDisplayElements(
                        instrument
                    )
                ) {

                    const alreadyBlack =
                        runtime.electrical
                            .blackouts
                            .some(
                                record =>
                                    record.target ===
                                    element
                            );

                    if (!alreadyBlack) {

                        const blackout =
                            makeBlackoutForElement(
                                element
                            );

                        if (blackout) {

                            runtime.electrical
                                .blackouts
                                .push(
                                    blackout
                                );
                        }
                    }
                }
            }
        }

        /*
         * If GeoFS has a global instruments.show(),
         * don't let it undo the electrical failure.
         */
        if (
            window.instruments &&
            typeof window.instruments.show ===
            'function' &&
            !runtime.electrical
                .instrumentsShow
        ) {

            runtime.electrical
                .instrumentsShow =
                window.instruments.show;

            const originalShow =
                window.instruments.show;

            window.instruments.show =
                function (...args) {

                    if (F.electrical) {
                        return;
                    }

                    return originalShow.apply(
                        this,
                        args
                    );
                };
        }

        safe(() => {

            if (
                typeof window.instruments
                    ?.hide ===
                'function'
            ) {

                window.instruments.hide();
            }

        });
    }

    function restoreElectrical() {

        /*
         * Restore global instrument show().
         */
        if (
            window.instruments &&
            runtime.electrical
                .instrumentsShow
        ) {

            safe(() => {

                window.instruments.show =
                    runtime.electrical
                        .instrumentsShow;

            });
        }

        /*
         * Restore individual instruments.
         */
        restoreElectricalInstruments();

        /*
         * Remove black screen barriers.
         */
        restoreElectricalBlackouts();

        /*
         * Restore autopilot methods.
         */
        restoreAutopilotLock();

        /*
         * Restore normal virtual instruments.
         */
        safe(() => {

            if (
                typeof window.instruments
                    ?.show ===
                'function'
            ) {

                window.instruments.show();
            }

        });

        runtime.electrical
            .instrumentsShow =
            null;

        runtime.electrical
            .instrumentsHide =
            null;

        runtime.electrical
            .captured =
            false;
    }

    // ============================================================
    // AIRCRAFT CACHE
    // ============================================================

    function clearAircraftCache() {

        for (
            const index
            of runtime.smoke.keys()
        ) {

            destroyEngineSmoke(
                index
            );
        }

        destroyFuelLeakTrail();

        runtime.engines.clear();

        /*
         * Remove electrical overlays and method hooks.
         *
         * If electrical failure is still active, the next
         * frame will capture the new aircraft and apply it again.
         */
        restoreElectrical();

        runtime.gear.nose = null;
        runtime.gear.left = null;
        runtime.gear.right = null;

        runtime.controls.flaps =
            null;

        runtime.controls.spoilers =
            null;

        runtime.controls.brakes =
            null;

        runtime.controls.gear =
            null;

        runtime.fuel.property =
            null;

        runtime.fuel.original =
            null;

        runtime.fuelAccumulator =
            0;

        runtime.fuel.leakAnchor =
            null;

        runtime.aircraft =
            null;

        runtime.aircraftId =
            null;
    }

    function rebuildAircraftCache(ac) {

        if (!ac) {
            return;
        }

        if (runtime.aircraft === ac) {
            return;
        }

        if (runtime.aircraft) {
            clearAircraftCache();
        }

        runtime.aircraft =
            ac;

        runtime.aircraftId =
            ac.id !== undefined
                ? ac.id
                : ac;

        runtime.controls.flaps =
            findControl([
                'flaps'
            ]);

        runtime.controls.spoilers =
            findControl([
                'airbrakes',
                'spoilers'
            ]);

        runtime.controls.brakes =
            findControl([
                'brakes',
                'brake'
            ]);

        runtime.controls.gear =
            findControl([
                'gear'
            ]);

        runtime.fuel.property =
            discoverFuelProperty(ac);
    }

    // ============================================================
    // FRAME LOOP
    // ============================================================

    let lastTime =
        performance.now();

    function failureFrame() {

        const ac =
            getAircraft();

        if (!ac) {
            return;
        }

        rebuildAircraftCache(ac);

        const now =
            performance.now();

        const deltaSeconds =
            clamp(
                (now - lastTime) / 1000,
                0,
                0.10
            );

        lastTime =
            now;

        // --------------------------------------------------------
        // ENGINES
        // --------------------------------------------------------

        const engines =
            getEngines(ac);

        for (
            let i = 0;
            i < engines.length;
            i++
        ) {

            const key =
                `engine${i + 1}`;

            if (F[key]) {

                enforceEngineFailure(i);

                createEngineSmoke(i);

            } else {

                restoreEngine(i);

                destroyEngineSmoke(i);
            }
        }

        if (runtime.smoke.size) {
            darkenEngineSmoke();
        }

        // --------------------------------------------------------
        // GEAR STUCK
        // --------------------------------------------------------

        enforceGearStuck();

        // --------------------------------------------------------
        // FLAPS
        // --------------------------------------------------------

        enforceFlapFailure();

        // --------------------------------------------------------
        // SPOILERS
        // --------------------------------------------------------

        enforceSpoilerFailure();

        // --------------------------------------------------------
        // BRAKES
        // --------------------------------------------------------

        enforceBrakeFailure();

        // --------------------------------------------------------
        // ELECTRICAL
        // --------------------------------------------------------

        enforceElectricalFailure();

        // --------------------------------------------------------
        // FUEL
        // --------------------------------------------------------

        enforceFuelLeak(
            deltaSeconds
        );
    }

    // ============================================================
    // FRAME CALLBACK MANAGEMENT
    // ============================================================

    function startLoop() {

        if (frameCallback !== null) {
            return;
        }

        const api =
            window.geofs?.api;

        if (
            api &&
            typeof api
                .addFrameCallback ===
            'function'
        ) {

            frameCallback =
                api.addFrameCallback(
                    failureFrame
                );

            return;
        }

        frameCallback =
            requestAnimationFrame(
                function loop() {

                    failureFrame();

                    frameCallback =
                        requestAnimationFrame(
                            loop
                        );
                }
            );
    }

    function stopLoop() {

        if (frameCallback === null) {
            return;
        }

        const api =
            window.geofs?.api;

        safe(() => {

            if (
                api &&
                typeof api
                    .removeFrameCallback ===
                'function'
            ) {

                api.removeFrameCallback(
                    frameCallback
                );

            } else {

                cancelAnimationFrame(
                    frameCallback
                );
            }

        });

        frameCallback =
            null;
    }

    // ============================================================
    // FAILURE TOGGLE
    // ============================================================

    function setFailure(
        key,
        enabled
    ) {

        if (!(key in F)) {
            return;
        }

        F[key] =
            !!enabled;

        if (F[key]) {

            const ac =
                getAircraft();

            if (ac) {
                rebuildAircraftCache(
                    ac
                );
            }

        } else if (
            key === 'fuelLeak'
        ) {

            destroyFuelLeakTrail();

        } else if (
            key === 'electrical'
        ) {

            restoreElectrical();
        }

        updateButtons();
    }

    function toggleFailure(key) {

        setFailure(
            key,
            !F[key]
        );
    }

    // ============================================================
    // RESET
    // ============================================================

    function resetAll() {

        for (
            const key
            of Object.keys(F)
        ) {

            F[key] =
                false;
        }

        const engines =
            getEngines();

        for (
            const index
            of runtime.engines.keys()
        ) {

            if (engines[index]) {

                restoreEngine(
                    index
                );
            }
        }

        for (
            const index
            of runtime.smoke.keys()
        ) {

            destroyEngineSmoke(
                index
            );
        }

        destroyFuelLeakTrail();

        restoreElectrical();

        runtime.controls.flaps =
            findControl([
                'flaps'
            ]);

        runtime.controls.spoilers =
            findControl([
                'airbrakes',
                'spoilers'
            ]);

        runtime.controls.brakes =
            findControl([
                'brakes',
                'brake'
            ]);

        runtime.controls.gear =
            findControl([
                'gear'
            ]);

        runtime.engines.clear();

        runtime.fuel.property =
            discoverFuelProperty(
                getAircraft()
            );

        runtime.fuelAccumulator =
            0;

        updateButtons();
    }

    // ============================================================
    // UI
    // ============================================================

    const style =
        document.createElement('style');

    style.textContent = `
        #${ID} {
            position: fixed;
            right: 110px;
            bottom: 5px;
            z-index: 999999;
            font-family: Arial, sans-serif;
        }

        #${ID} .failure-main {
            width: 112px;
            height: 34px;

            border: 1px solid #566572;
            border-radius: 5px;

            background:
                linear-gradient(
                    to bottom,
                    #26323c,
                    #11181e
                );

            color: #e8edf1;

            font-size: 12px;
            font-weight: 700;
            letter-spacing: 1px;

            cursor: pointer;

            box-shadow:
                0 2px 8px rgba(0,0,0,.55),
                inset 0 1px rgba(255,255,255,.08);
        }

        #${ID} .failure-main:hover {
            background:
                linear-gradient(
                    to bottom,
                    #31404c,
                    #151e25
                );
        }

        #${ID} .failure-panel {
            display: none;

            position: absolute;
            right: 0;
            bottom: 39px;

            width: 305px;

            padding: 10px;

            background:
                linear-gradient(
                    145deg,
                    rgba(27,35,42,.98),
                    rgba(8,12,16,.98)
                );

            border: 1px solid #596b78;
            border-radius: 7px;

            box-shadow:
                0 8px 28px rgba(0,0,0,.65),
                inset 0 1px rgba(255,255,255,.05);
        }

        #${ID}.open .failure-panel {
            display: block;
        }

        #${ID} .failure-title {
            color: #f0f4f7;
            font-size: 14px;
            font-weight: 800;
            letter-spacing: 2px;

            padding: 4px 4px 9px;

            border-bottom: 1px solid #3d4c57;
            margin-bottom: 8px;
        }

        #${ID} .failure-section {
            margin-bottom: 8px;
        }

        #${ID} .failure-section-title {
            color: #8ea2b0;

            font-size: 9px;
            font-weight: 800;
            letter-spacing: 1.5px;

            padding: 3px 4px 5px;
        }

        #${ID} .failure-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 5px;
        }

        #${ID} .failure-button {
            min-height: 30px;

            border: 1px solid #465762;
            border-radius: 4px;

            background:
                linear-gradient(
                    to bottom,
                    #202b33,
                    #151d23
                );

            color: #d8e1e7;

            font-size: 10px;
            font-weight: 700;

            cursor: pointer;

            transition:
                background .12s,
                border-color .12s,
                color .12s;
        }

        #${ID} .failure-button:hover {
            background:
                linear-gradient(
                    to bottom,
                    #2c3a44,
                    #1a242b
                );
        }

        #${ID} .failure-button.failed {
            background:
                linear-gradient(
                    to bottom,
                    #b92828,
                    #6d1111
                );

            border-color: #ff5555;
            color: white;

            box-shadow:
                inset 0 0 7px rgba(255,80,80,.3),
                0 0 5px rgba(255,40,40,.25);
        }

        #${ID} .reset {
            width: 100%;
            margin-top: 4px;

            min-height: 32px;

            border: 1px solid #687985;
            border-radius: 4px;

            background:
                linear-gradient(
                    to bottom,
                    #35434c,
                    #202a31
                );

            color: #f0f3f5;

            font-weight: 800;
            font-size: 10px;

            cursor: pointer;
        }

        #${ID} .reset:hover {
            background:
                linear-gradient(
                    to bottom,
                    #465660,
                    #29343b
                );
        }
    `;

    document.head.appendChild(
        style
    );

    const root =
        document.createElement('div');

    root.id =
        ID;

    const panel =
        document.createElement('div');

    panel.className =
        'failure-panel';

    const title =
        document.createElement('div');

    title.className =
        'failure-title';

    title.textContent =
        'FAILURES';

    panel.appendChild(
        title
    );

    function addSection(
        name,
        entries
    ) {

        const section =
            document.createElement('div');

        section.className =
            'failure-section';

        const sectionTitle =
            document.createElement('div');

        sectionTitle.className =
            'failure-section-title';

        sectionTitle.textContent =
            name;

        section.appendChild(
            sectionTitle
        );

        const grid =
            document.createElement('div');

        grid.className =
            'failure-grid';

        for (
            const entry
            of entries
        ) {

            const btn =
                document.createElement(
                    'button'
                );

            btn.className =
                'failure-button';

            btn.dataset.failure =
                entry.key;

            btn.textContent =
                entry.label;

            btn.addEventListener(
                'click',
                () => {

                    toggleFailure(
                        entry.key
                    );
                }
            );

            grid.appendChild(
                btn
            );
        }

        section.appendChild(
            grid
        );

        panel.appendChild(
            section
        );
    }

    addSection(
        'ENGINES',
        [
            {
                key: 'engine1',
                label: 'ENGINE 1'
            },
            {
                key: 'engine2',
                label: 'ENGINE 2'
            },
            {
                key: 'engine3',
                label: 'ENGINE 3'
            },
            {
                key: 'engine4',
                label: 'ENGINE 4'
            }
        ]
    );

    addSection(
        'LANDING GEAR',
        [
            {
                key: 'gearStuck',
                label: 'GEAR STUCK'
            }
        ]
    );

    addSection(
        'FUEL',
        [
            {
                key: 'fuelLeak',
                label: 'FUEL LEAK'
            }
        ]
    );

    addSection(
        'FLIGHT CONTROLS',
        [
            {
                key: 'flaps',
                label: 'FLAPS'
            },
            {
                key: 'spoilers',
                label: 'SPOILERS'
            },
            {
                key: 'brakes',
                label: 'BRAKES'
            }
        ]
    );

    addSection(
        'ELECTRICAL',
        [
            {
                key: 'electrical',
                label: 'TOTAL ELECTRICAL'
            }
        ]
    );

    const reset =
        document.createElement(
            'button'
        );

    reset.className =
        'reset';

    reset.textContent =
        'RESET ALL';

    reset.addEventListener(
        'click',
        resetAll
    );

    panel.appendChild(
        reset
    );

    const main =
        document.createElement(
            'button'
        );

    main.className =
        'failure-main';

    main.textContent =
        'FAILURES';

    main.addEventListener(
        'click',
        () => {

            root.classList.toggle(
                'open'
            );
        }
    );

    root.appendChild(
        panel
    );

    root.appendChild(
        main
    );

    document.body.appendChild(
        root
    );

    // ============================================================
    // BUTTON UPDATE
    // ============================================================

    function updateButtons() {

        root
            .querySelectorAll(
                '.failure-button'
            )
            .forEach(btn => {

                const key =
                    btn.dataset.failure;

                const active =
                    !!F[key];

                btn.classList.toggle(
                    'failed',
                    active
                );

                const original =
                    btn.dataset.original ||
                    btn.textContent.replace(
                        /\s+•\s+FAILED$/,
                        ''
                    );

                btn.dataset.original =
                    original;

                btn.textContent =
                    active
                        ? `${original}  •  FAILED`
                        : original;
            });

        const count =
            engineCount();

        for (
            let i = 1;
            i <= 4;
            i++
        ) {

            const btn =
                root.querySelector(
                    `[data-failure="engine${i}"]`
                );

            if (!btn) {
                continue;
            }

            btn.style.display =
                i <= count
                    ? ''
                    : 'none';
        }
    }

    // ============================================================
    // BOOT
    // ============================================================

    function boot() {

        if (
            window.geofs?.aircraft?.instance &&
            window.geofs?.api &&
            window.controls
        ) {

            if (bootTimer) {

                clearInterval(
                    bootTimer
                );

                bootTimer =
                    null;
            }

            rebuildAircraftCache(
                getAircraft()
            );

            startLoop();

            updateButtons();

            return;
        }

        if (!bootTimer) {

            bootTimer =
                setInterval(
                    boot,
                    500
                );
        }
    }

    boot();

})();
