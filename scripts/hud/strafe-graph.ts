import { PanelHandler } from 'util/module-helpers';
import { RegisterHUDPanelForGamemode } from '../util/register-for-gamemodes';
import { Gamemode } from 'common/web/enums/gamemode.enum';

const Colors = {
	PERFECT: { rgb: [255, 255, 255] as [number, number, number], fillAlpha: 0.1, lineAlpha: 0.25 },
	DELTA: { rgb: [24, 150, 211] as [number, number, number], fillAlpha: 0.75, lineAlpha: 0.9 },
	CHANGE_GOOD: [24, 150, 211] as [number, number, number],
	CHANGE_BAD: [255, 0, 0] as [number, number, number]
};

const GRAPH_MAX_POINTS = 250;
const GRAPH_MAX_DELTA = 11;
const GRAPH_PADDING = 1;
const GRAPH_FILLED = true;
const GRAPH_CHANGE_COLOR = false; // requires filled
const GRAPH_CHANGE_COLOR_DIST = 2;

const DEFAULT_AIRACCEL = 1000;
const DEFAULT_SPEEDCAP = 30;
const DEFAULT_SURFACE_FRICTION = 1;
const DEFAULT_WISHSPEED = 260;

const RAD2DEG = 180 / Math.PI;

interface StrafePoint {
	delta: number;
	perfectDelta: number;
	rgb: [number, number, number];
}

interface CanvasPoint {
	x: number;
	y: number;
	rgb: [number, number, number];
}

interface DrawingBounds {
	top: number;
	left: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

@PanelHandler()
class StrafeGraph {
	readonly panels = {
		strafeGraph: $('#StrafeGraph')
	};

	strafeHistory: StrafePoint[] = [];
	lastYaw: number | null = null;
	initValues = false;
	drawingBounds: DrawingBounds = {
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		width: 0,
		height: 0
	};
	cleanup: (() => void) | null = null;

	constructor() {
		this.cleanup = RegisterHUDPanelForGamemode({
			gamemodes: [
				Gamemode.SURF,
				Gamemode.BHOP,
				Gamemode.BHOP_HL1,
				Gamemode.CLIMB_MOM,
				Gamemode.CLIMB_KZT,
				Gamemode.CLIMB_16
			],
			onLoad: () => this.onLoad(),
			events: [],
			handledEvents: [{ event: 'HudProcessInput', panel: $.GetContextPanel(), callback: () => this.onUpdate() }]
		});
	}

	destructor() {
		this.cleanup?.();
	}

	onLoad() {
		this.initValues = false;
	}

	onUpdate() {
		this.updateGraph();
		this.drawGraph();
	}

	updateGraph() {
		const jumpTime = MomentumTimerAPI.GetObservedTimerStatus().runTimeTickstamp;
		if (jumpTime === 0) {
			this.initValues = false;
			return;
		}

		if (!this.initValues) {
			this.strafeHistory = [];
			this.lastYaw = null;
			this.initValues = true;
		}

		const yaw = MomentumPlayerAPI.GetAngles().y;
		const velocity = MomentumPlayerAPI.GetVelocity();
		const speed = Math.hypot(velocity.x, velocity.y);

		if (this.lastYaw !== null) {
			const perfectDelta = this.getPerfectDelta(speed);
			const delta = Math.abs(this.normalizeYaw(yaw - this.lastYaw));

			const rgb = GRAPH_CHANGE_COLOR ? this.getColorForDelta(delta, perfectDelta) : Colors.DELTA.rgb;

			this.strafeHistory.push({ delta, perfectDelta, rgb });

			while (this.strafeHistory.length > GRAPH_MAX_POINTS) {
				this.strafeHistory.shift();
			}
		}

		this.lastYaw = yaw;
	}

	drawGraph() {
		this.panels.strafeGraph.Clear('#00000000');

		const jumpTime = MomentumTimerAPI.GetObservedTimerStatus().runTimeTickstamp;
		if (jumpTime === 0 || this.strafeHistory.length === 0) return;

		this.setupDrawing();

		const xMult = this.drawingBounds.width / GRAPH_MAX_POINTS;
		const yMult = this.drawingBounds.height / GRAPH_MAX_DELTA;

		const deltaPoints: CanvasPoint[] = [];
		const perfectPoints: CanvasPoint[] = [];

		for (const [i, point] of this.strafeHistory.entries()) {
			const x = this.drawingBounds.left + i * xMult;

			deltaPoints.push({
				x,
				y: this.drawingBounds.bottom - Math.min(point.delta, GRAPH_MAX_DELTA) * yMult,
				rgb: point.rgb
			});

			perfectPoints.push({
				x,
				y: this.drawingBounds.bottom - Math.min(point.perfectDelta, GRAPH_MAX_DELTA) * yMult,
				rgb: Colors.PERFECT.rgb
			});
		}

		if (GRAPH_FILLED) this.drawPoly(perfectPoints, Colors.PERFECT.fillAlpha);
		this.drawLine(perfectPoints, Colors.PERFECT.rgb, Colors.PERFECT.lineAlpha);

		if (GRAPH_FILLED) this.drawPoly(deltaPoints, Colors.DELTA.fillAlpha);
		this.drawLine(deltaPoints, Colors.DELTA.rgb, Colors.DELTA.lineAlpha);
	}

	getPerfectDelta(speed: number): number {
		const airaccel = GameInterfaceAPI.GetSettingFloat('sv_airaccelerate') || DEFAULT_AIRACCEL;
		const speedcap = GameInterfaceAPI.GetSettingFloat('sv_air_max_wishspeed') || DEFAULT_SPEEDCAP;
		const tickrate = MomentumMovementAPI.GetTickInterval();

		const accelspeed = Math.min(airaccel * DEFAULT_WISHSPEED * tickrate * DEFAULT_SURFACE_FRICTION, speedcap);

		return Math.atan(accelspeed / speed) * RAD2DEG;
	}

	getColorForDelta(delta: number, perfectDelta: number): [number, number, number] {
		let perfectPercent = Math.abs(perfectDelta - delta) / GRAPH_CHANGE_COLOR_DIST;
		perfectPercent = Math.max(0, Math.min(1, perfectPercent));

		return [
			this.lerp(Colors.CHANGE_GOOD[0], Colors.CHANGE_BAD[0], perfectPercent),
			this.lerp(Colors.CHANGE_GOOD[1], Colors.CHANGE_BAD[1], perfectPercent),
			this.lerp(Colors.CHANGE_GOOD[2], Colors.CHANGE_BAD[2], perfectPercent)
		];
	}

	drawLine(points: CanvasPoint[], rgb: [number, number, number], alpha: number) {
		const temp: number[] = [];
		for (const point of points) {
			this.pushCanvasPoint(temp, point.x, point.y);
		}

		this.panels.strafeGraph.DrawLinePoints(temp.length / 2, temp, 1, `rgba(${rgb.join(',')}, ${alpha})`);
	}

	drawPoly(points: CanvasPoint[], alpha: number) {
		for (let i = 0; i < points.length - 1; i++) {
			const pointA = points[i];
			const pointB = points[i + 1];

			const temp: number[] = [];
			this.pushCanvasPoint(temp, pointA.x, pointA.y);
			this.pushCanvasPoint(temp, pointB.x, pointB.y);
			this.pushCanvasPoint(temp, pointB.x, this.drawingBounds.bottom);
			this.pushCanvasPoint(temp, pointA.x, this.drawingBounds.bottom);

			this.panels.strafeGraph.DrawPoly(temp.length / 2, temp, `rgba(${pointA.rgb.join(',')}, ${alpha})`);
		}
	}

	pushCanvasPoint(arr: number[], x: number, y: number) {
		arr.push(x, y);
	}

	normalizeYaw(yaw: number): number {
		if (yaw > 180.0) yaw -= 360.0;
		else if (yaw < -180.0) yaw += 360.0;

		return yaw;
	}

	lerp(start: number, end: number, amt: number): number {
		return (1 - amt) * start + amt * end;
	}

	setupDrawing() {
		const height = this.panels.strafeGraph.actuallayoutheight / this.panels.strafeGraph.actualuiscale_y;
		const width = this.panels.strafeGraph.actuallayoutwidth / this.panels.strafeGraph.actualuiscale_x;

		this.drawingBounds.top = GRAPH_PADDING;
		this.drawingBounds.left = GRAPH_PADDING;
		this.drawingBounds.right = width - GRAPH_PADDING;
		this.drawingBounds.bottom = height - GRAPH_PADDING;

		this.drawingBounds.width = this.drawingBounds.right - this.drawingBounds.left;
		this.drawingBounds.height = this.drawingBounds.bottom - this.drawingBounds.top;
	}
}
