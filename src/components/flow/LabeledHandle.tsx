"use client";

import { Handle, Position, type HandleType } from "@xyflow/react";

type Props = {
  id: string;
  type: HandleType;
  position: Position;
  label: string;
};

/**
 * Handle sits on the node edge; In/Out caption sits fully outside so it
 * never overlaps card content (see reactflow labeled-handle pattern).
 */
export function LabeledHandle({ id, type, position, label }: Props) {
  const isTarget = type === "target";
  return (
    <>
      <Handle
        id={id}
        type={type}
        position={position}
        className={isTarget ? "handle-target" : "handle-source"}
      />
      <span
        className={`handle-caption ${isTarget ? "handle-caption--in" : "handle-caption--out"}`}
        aria-hidden
      >
        {label}
      </span>
    </>
  );
}
