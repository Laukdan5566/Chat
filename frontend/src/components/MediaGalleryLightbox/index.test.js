import { buildMediaGalleryData } from "./index";

jest.mock("yet-another-react-lightbox/plugins/captions.css", () => ({}), { virtual: true });
jest.mock("yet-another-react-lightbox/plugins/thumbnails.css", () => ({}), { virtual: true });
jest.mock("yet-another-react-lightbox/styles.css", () => ({}), { virtual: true });
jest.mock("yet-another-react-lightbox", () => ({ __esModule: true, default: () => null }));
jest.mock("yet-another-react-lightbox/plugins/captions", () => () => null, { virtual: true });
jest.mock("yet-another-react-lightbox/plugins/download", () => () => null, { virtual: true });
jest.mock("yet-another-react-lightbox/plugins/thumbnails", () => () => null, { virtual: true });
jest.mock("yet-another-react-lightbox/plugins/video", () => () => null, { virtual: true });
jest.mock("yet-another-react-lightbox/plugins/zoom", () => () => null, { virtual: true });

test("indexes historical images and videos even without WhatsApp metadata", () => {
  const history = [
    { id: "old-photo", mediaType: "image", mediaUrl: "/public/photo.jpg", isContactHistory: true },
    { id: "old-video", mediaType: "video", mediaUrl: "/public/video.mp4", dataJson: "invalid" }
  ];
  const current = [{ id: "current-photo", mediaType: "image", mediaUrl: "/public/new.jpg" }];
  const gallery = buildMediaGalleryData([...history, ...current]);
  expect(gallery.slides[gallery.byMessageId["old-photo"]].src).toBe("/public/photo.jpg");
  expect(gallery.slides[gallery.byMessageId["old-video"]].sources[0].src).toBe("/public/video.mp4");
  expect(gallery.byMessageId["current-photo"]).toBe(2);
});

test("documents and missing media do not shift the image index", () => {
  const gallery = buildMediaGalleryData([
    { id: "pdf", mediaType: "application", mediaUrl: "/public/document.pdf" },
    { id: "missing", mediaType: "image" },
    { id: "photo", mediaType: "image", mediaUrl: "/public/photo.jpg" }
  ]);
  expect(gallery.slides).toHaveLength(1);
  expect(gallery.byMessageId.photo).toBe(0);
});
