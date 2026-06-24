import type { Season } from "../../types";

interface Props {
  seasons: Season[];
  selected: number;
  onSelect: (n: number) => void;
}

export default function SeasonSelector({ seasons, selected, onSelect }: Props) {
  return (
    <div className="flex gap-2 flex-wrap">
      {seasons.map((s) => (
        <button
          key={s.number}
          onClick={() => onSelect(s.number)}
          className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${
            s.number === selected
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          Season {s.number}
        </button>
      ))}
    </div>
  );
}
