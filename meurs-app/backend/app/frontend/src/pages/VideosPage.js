import React, { useEffect, useState } from "react";
import axios from "axios";

export default function VideosPage() {
  const [videoList, setVideoList] = useState([]);

  useEffect(() => {
    axios.get("http://127.0.0.1:8000/videos").then((res) => {
      setVideoList(res.data.videos);
    });
  }, []);

  return (
    <div>
      <h2>Videos</h2>
      {videoList.map((file, i) => (
        <div key={i}>
          <p>{file}</p>
          <video controls width="400">
            <source src={`http://127.0.0.1:8000/static/videos/${file}`} type="video/mp4" />
          </video>
        </div>
      ))}
    </div>
  );
}
