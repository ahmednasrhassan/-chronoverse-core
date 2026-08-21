import { defineField, defineType } from "sanity";

export const comment = defineType({
  name: "comment",
  title: "Comment",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Author Name",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "email",
      title: "Email Address",
      type: "string",
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: "comment",
      title: "Comment Text",
      type: "text",
      validation: (Rule) => Rule.required().min(3),
    }),
    defineField({
      name: "approved",
      title: "Approved for Display",
      type: "boolean",
      description: "Comments won't appear on the site until approved",
      initialValue: false,
    }),
    defineField({
      name: "post",
      title: "Target Post",
      type: "reference",
      to: [{ type: "post" }],
    }),
  ],
});