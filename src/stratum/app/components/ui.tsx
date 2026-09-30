import type { CSSProperties, ReactNode } from "react";

export type DotState = "done" | "warning" | "error";

const DOT: Record<DotState, string> = { done: "var(--state-done)", warning: "var(--warn-primary)", error: "var(--error-primary)" };

/** The only colour source for status: three readings, like the prototype's StateDot. */
export function StateDot({ state, size = 8, style }: { state: DotState; size?: number; style?: CSSProperties }) {
	return <span aria-hidden style={{ width: size, height: size, borderRadius: "50%", background: DOT[state], display: "inline-block", flex: "0 0 auto", ...style }} />;
}

export function Pill({
	children,
	onClick,
	active,
	title,
	disabled,
	style,
	...rest
}: {
	children: ReactNode;
	onClick?: () => void;
	active?: boolean;
	title?: string;
	disabled?: boolean;
	style?: CSSProperties;
} & Record<string, unknown>) {
	const Tag = onClick ? "button" : "span";
	return (
		<Tag
			onClick={onClick}
			title={title}
			disabled={disabled}
			{...(rest as object)}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 6,
				height: 26,
				padding: "0 10px",
				borderRadius: 999,
				border: "1px solid var(--border-l2)",
				background: active ? "var(--selector)" : "var(--bg-layer-2)",
				fontSize: 12,
				color: "var(--label-primary)",
				whiteSpace: "nowrap",
				cursor: onClick && !disabled ? "pointer" : "default",
				opacity: disabled ? 0.6 : 1,
				...style,
			}}
		>
			{children}
		</Tag>
	);
}

export function GhostButton({ children, onClick, disabled, title, ariaLabel, style }: { children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string; ariaLabel?: string; style?: CSSProperties }) {
	return (
		<button
			onClick={onClick}
			disabled={disabled}
			title={title}
			aria-label={ariaLabel}
			style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12, color: disabled ? "var(--label-tertiary)" : "var(--label-primary)", ...style }}
			onPointerEnter={(e) => {
				if (!disabled) e.currentTarget.style.background = "var(--interactive-hover)";
			}}
			onPointerLeave={(e) => (e.currentTarget.style.background = "")}
		>
			{children}
		</button>
	);
}

export const SECTION_LABEL: CSSProperties = {
	color: "var(--label-tertiary)",
	fontSize: 10,
	fontWeight: 600,
	letterSpacing: "0.14em",
	textTransform: "uppercase",
};
