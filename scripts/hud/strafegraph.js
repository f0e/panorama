'use strict';

const GRAPH_MAX_POINTS = 250;
const GRAPH_MAX_DELTA = 11;
const GRAPH_PADDING = 1;
const GRAPH_FILLED = true;

const GRAPH_PERFECT_COLOR = [255, 255, 255];
const GRAPH_DELTA_COLOR = [24, 150, 211];

const GRAPH_CHANGE_COLOR = false; // requires filled
const GRAPH_CHANGE_COLOR_DIST = 2;
const GRAPH_CHANGE_COLOR_GOOD_COLOR = [24, 150, 211];
const GRAPH_CHANGE_COLOR_BAD_COLOR = [255, 0, 0];

class StrafeGraph {
	static getPerfectDelta(speed) {
		let airaccel = GameInterfaceAPI.GetSettingFloat('sv_airaccelerate');
		let speedcap = GameInterfaceAPI.GetSettingFloat('sv_air_max_wishspeed');

		if (!airaccel) airaccel = 1000; // -dev breaks this idk
		if (!speedcap) speedcap = 30;

		const tickrate = MomentumMovementAPI.GetTickInterval();
		const surfaceFriction = 1; // not sure if this even exists in momentum
		const wishspeed = 260; // speed which your current weapon allows you to run (including speed crops - stamina, ducking etc). dont think i can get it with current api

		const accelspeed = Math.min(airaccel * wishspeed * tickrate * surfaceFriction, speedcap);

		return Math.atan(accelspeed / speed) * (180 / Math.PI);
	}

	static strafeGraph = null;
	static strafeHistory = [];
	static lastYaw = null;
	static initValues = false;

	static strafeGraphUpdate() {
		const jumpTime = MomentumTimerAPI.GetCurrentRunTime();
		if (jumpTime == 0) {
			this.initValues = false;
			return;
		}

		if (!this.initValues) {
			this.strafeHistory = [];
			this.lastYaw = null;

			this.initValues = true;
		}

		// updating values
		const yaw = MomentumPlayerAPI.GetAngles().y;

		const velocity = MomentumPlayerAPI.GetVelocity();
		const speed = Math.hypot(velocity.x, velocity.y);

		if (this.lastYaw !== null) {
			const perfectDelta = this.getPerfectDelta(speed);
			const delta = Math.abs(this.#normalizeYaw(yaw - this.lastYaw));

			let rgb;
			if (GRAPH_CHANGE_COLOR) {
				// experimental, looks trash rn
				let perfectPercent = Math.abs(perfectDelta - delta) / GRAPH_CHANGE_COLOR_DIST;
				if (perfectPercent < 0) perfectPercent = 0;
				else if (perfectPercent > 1) perfectPercent = 1;

				rgb = [
					this.#lerp(GRAPH_CHANGE_COLOR_GOOD_COLOR[0], GRAPH_CHANGE_COLOR_BAD_COLOR[0], perfectPercent),
					this.#lerp(GRAPH_CHANGE_COLOR_GOOD_COLOR[1], GRAPH_CHANGE_COLOR_BAD_COLOR[1], perfectPercent),
					this.#lerp(GRAPH_CHANGE_COLOR_GOOD_COLOR[2], GRAPH_CHANGE_COLOR_BAD_COLOR[2], perfectPercent)
				];
			} else {
				rgb = GRAPH_DELTA_COLOR;
			}

			const strafeData = {
				delta,
				perfectDelta,
				rgb
			};

			this.strafeHistory.push(strafeData);

			// trim entries
			while (this.strafeHistory.length > GRAPH_MAX_POINTS) this.strafeHistory.shift();
		}

		this.lastYaw = yaw;
	}

	static strafeGraphDraw() {
		this.strafeGraph.Clear('#00000000');

		const jumpTime = MomentumTimerAPI.GetCurrentRunTime();
		if (jumpTime == 0 || this.strafeHistory.length == 0) return;

		this.#setupDrawing();

		const xMult = this.width / GRAPH_MAX_POINTS;
		const yMult = this.height / GRAPH_MAX_DELTA;

		const deltaPoints = [];
		const perfectPoints = [];

		for (const [i, point] of this.strafeHistory.entries()) {
			const x = this.left + i * xMult;

			deltaPoints.push({
				x,
				y: this.bottom - Math.min(point.delta, GRAPH_MAX_DELTA) * yMult,
				rgb: point.rgb
			});

			perfectPoints.push({
				x,
				y: this.bottom - Math.min(point.perfectDelta, GRAPH_MAX_DELTA) * yMult,
				rgb: GRAPH_PERFECT_COLOR
			});
		}

		// perfect delta
		if (GRAPH_FILLED) this.#drawPoly(perfectPoints, 0.1);
		this.#drawLine(perfectPoints, GRAPH_PERFECT_COLOR, 0.25);

		// player delta
		if (GRAPH_FILLED) this.#drawPoly(deltaPoints, 0.75);
		this.#drawLine(deltaPoints, GRAPH_DELTA_COLOR, 0.9);
	}

	static onTick() {
		this.strafeGraphUpdate();
		this.strafeGraphDraw();
	}

	static #drawLine(points, rgb, alpha) {
		const temp = [];
		for (const point of points) {
			this.#pushCanvasPoint(temp, point.x, point.y);
		}

		this.strafeGraph.DrawLinePoints(temp.length / 2, temp, 1, `rgba(${rgb.join(',')}, ${alpha})`);
	}

	static #drawPoly(points, alpha) {
		// unoptimised
		for (let i = 0; i < points.length - 1; i++) {
			const pointA = points[i];
			const pointB = points[i + 1];

			const temp = [];
			this.#pushCanvasPoint(temp, pointA.x, pointA.y);
			this.#pushCanvasPoint(temp, pointB.x, pointB.y);
			this.#pushCanvasPoint(temp, pointB.x, this.bottom);
			this.#pushCanvasPoint(temp, pointA.x, this.bottom);

			this.strafeGraph.DrawPoly(temp.length / 2, temp, `rgba(${pointA.rgb.join(',')}, ${alpha})`);
		}
	}

	static #pushCanvasPoint(arr, x, y) {
		arr.push(x);
		arr.push(y);
	}

	static #normalizeYaw(yaw) {
		if (yaw > 180.0) yaw -= 360.0;
		else if (yaw < -180.0) yaw += 360.0;

		return yaw;
	}

	static #lerp(start, end, amt) {
		return (1 - amt) * start + amt * end;
	}

	static #setupDrawing() {
		const height = this.strafeGraph.actuallayoutheight / this.strafeGraph.actualuiscale_y;
		const width = this.strafeGraph.actuallayoutwidth / this.strafeGraph.actualuiscale_x;

		this.top = GRAPH_PADDING;
		this.left = GRAPH_PADDING;
		this.right = width - GRAPH_PADDING;
		this.bottom = height - GRAPH_PADDING;

		this.width = this.right - this.left;
		this.height = this.bottom - this.top;
	}

	static {
		$.RegisterEventHandler('ChaosHudProcessInput', $.GetContextPanel(), this.onTick.bind(this));

		this.strafeGraph = $('#StrafeGraph');
	}
}
