import React, { useEffect, useState } from "react";
import axios from "axios";

export default function MusicPage() {
  const [musicList, setMusicList] = useState([]);

  useEffect(() => {
    axios.get("http://127.0.0.1:8000/music").then((res) => {
      setMusicList(res.data.music);
    });
  }, []);

  return (
    <div>
      <h2>Music</h2>
      {musicList.map((file, i) => (
        <div key={i}>
          <p>{file}</p>
          <audio controls>
            <source src={`http://127.0.0.1:8000/static/music/${file}`} type="audio/mpeg" />
          </audio>
        </div>
      ))}
    </div>
  );
}
