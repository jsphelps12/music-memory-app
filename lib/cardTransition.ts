interface CardOrigin {
  x: number;
  y: number;
  scale: number;
  active: boolean;
}

const origin: CardOrigin = { x: 0, y: 0, scale: 1, active: false };

export function setCardOrigin(x: number, y: number, scale: number) {
  origin.x = x;
  origin.y = y;
  origin.scale = scale;
  origin.active = true;
}

// Read once and reset — call at detail screen init
export function consumeCardOrigin(): CardOrigin {
  const snap = { ...origin };
  origin.active = false;
  return snap;
}
