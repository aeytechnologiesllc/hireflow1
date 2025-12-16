import { useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

const EMOJI_CATEGORIES = {
  "Smileys": ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥"],
  "Gestures": ["👍", "👎", "👊", "✊", "🤛", "🤜", "🤝", "👏", "🙌", "👐", "🤲", "🙏", "✌️", "🤞", "🤟", "🤘", "👌", "🤌", "🤏", "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤙", "💪", "🦾", "🖕"],
  "Hearts": ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥", "❤️‍🩹", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️"],
  "Objects": ["🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "🥈", "🥉", "⭐", "🌟", "✨", "💫", "🔥", "💥", "💯", "✅", "❌", "❓", "❗", "💡", "📌", "📍", "🔗", "📎", "📧", "📞", "💼", "📁", "📂", "📊", "📈", "📉"],
};

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

export function EmojiPicker({ onEmojiSelect }: EmojiPickerProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const allEmojis = Object.values(EMOJI_CATEGORIES).flat();
  const filteredEmojis = search
    ? allEmojis.filter((emoji) => emoji.includes(search))
    : null;

  const handleSelect = (emoji: string) => {
    onEmojiSelect(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
          <Smile className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="end">
        <Input
          placeholder="Search emoji..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />
        <div className="max-h-64 overflow-y-auto">
          {filteredEmojis ? (
            <div className="grid grid-cols-8 gap-1">
              {filteredEmojis.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(emoji)}
                  className="h-8 w-8 flex items-center justify-center hover:bg-secondary rounded text-lg"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : (
            Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
              <div key={category} className="mb-3">
                <p className="text-xs text-muted-foreground mb-1 px-1">{category}</p>
                <div className="grid grid-cols-8 gap-1">
                  {emojis.map((emoji, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelect(emoji)}
                      className="h-8 w-8 flex items-center justify-center hover:bg-secondary rounded text-lg"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
