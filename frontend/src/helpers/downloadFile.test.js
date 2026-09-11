import axios from "axios";
import { downloadFile } from "./downloadFile";

jest.mock("axios", () => ({ get: jest.fn() }));

beforeEach(() => {
  jest.useFakeTimers();
  window.URL.createObjectURL = jest.fn(() => "blob:download");
  window.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test("keeps the PDF MIME type and releases the blob after the download starts", async () => {
  const pdf = new Blob(["pdf"], { type: "application/pdf" });
  axios.get.mockResolvedValue({ data: pdf });
  await downloadFile("/public/receipt.pdf");
  expect(window.URL.createObjectURL).toHaveBeenCalledWith(pdf);
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();
  jest.advanceTimersByTime(60000);
  expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:download");
});

test("falls back to the original HTTP URL if fetching the file fails", async () => {
  axios.get.mockRejectedValue(new Error("CORS"));
  let clicked;
  HTMLAnchorElement.prototype.click.mockImplementation(function () {
    clicked = { href: this.href, target: this.target };
  });
  await downloadFile("/public/receipt.pdf?token=example");
  expect(clicked.href).toBe(`${window.location.origin}/public/receipt.pdf?token=example`);
  expect(clicked.target).toBe("_blank");
  expect(window.URL.createObjectURL).not.toHaveBeenCalled();
});
