export interface Verdict {
  headline: string;
  sub: string;
  img: string;
}

// score is objective-adjusted: misere => -pnl, normal => pnl
export function verdict(mode: "misere" | "normal", score: number): Verdict {
  if (mode === "misere") {
    if (score >= 35)
      return {
        headline: "CERTIFIED TOXIC",
        sub: "Flow so poisonous the soup kitchen opened early.",
        img: "/img/breadline.jpg",
      };
    if (score >= 15)
      return {
        headline: "MAXIMUM HEAT ACCEPTED",
        sub: "Depositors seen forming a line outside your desk.",
        img: "/img/bank-run.jpg",
      };
    if (score > 0)
      return {
        headline: "SIR, THIS IS A LOSS",
        sub: "Technically money was destroyed. The crowd is unimpressed.",
        img: "/img/crowd-nyse.jpg",
      };
    return {
      headline: "YOU ACCIDENTALLY RAN A PROFITABLE DESK. DELETE YOUR TERMINAL.",
      sub: "The one job was losing. You couldn't even do that.",
      img: "/img/curb-market.jpg",
    };
  }
  if (score >= 25)
    return {
      headline: "PRINTING. RISK IS ASKING QUESTIONS.",
      sub: "The good kind of questions. For now.",
      img: "/img/brokers-curb.jpg",
    };
  if (score >= 8)
    return {
      headline: "ADEQUATE. THE DESK HEAD NODS ONCE.",
      sub: "Do not expect a second nod.",
      img: "/img/curb-market.jpg",
    };
  if (score >= 0)
    return {
      headline: "FLAT. WHY DID YOU EVEN COME IN.",
      sub: "The seat was warmed. Nothing else happened.",
      img: "/img/crowd-nyse.jpg",
    };
  return {
    headline: "YOU LOST MONEY IN NORMAL MODE. THE MISERE DESK IS RECRUITING.",
    sub: "Your adverse selection is somebody's alpha.",
    img: "/img/bank-run.jpg",
  };
}

export const LOADING_LINES = [
  "warming up the money incinerator",
  "locating the sharps",
  "calling risk to apologize in advance",
  "sweeping yesterday's losses under the tape",
  "briefing the noise traders on your reputation",
];
